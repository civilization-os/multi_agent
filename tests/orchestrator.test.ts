import { describe, it, expect, vi } from 'vitest';
import {
  MultiAgentRoom,
  RoleAgent,
  GroupChatOrchestrator,
  DirectorOrchestrator,
  PipelineOrchestrator,
} from '../src/index.js';
import {
  BaseChatModel,
  type UnifiedMessage,
  type UnifiedChatResponse,
  type UnifiedStreamChunk,
} from '@civilization/model-core';

class MockChatModel extends BaseChatModel<any> {
  public readonly providerName = 'mock';
  public invokeHandler: (messages: UnifiedMessage[]) => UnifiedChatResponse;

  constructor(invokeHandler: (messages: UnifiedMessage[]) => UnifiedChatResponse) {
    super({
      category: 'official',
      vendor: 'openai',
      modelName: 'mock-model',
      apiKey: 'mock-key',
    });
    this.invokeHandler = invokeHandler;
  }

  public formatMessages(messages: UnifiedMessage[]): unknown {
    return messages;
  }
  public formatTools(tools?: any): unknown {
    return tools;
  }
  public parseResponse(rawResponse: unknown): UnifiedChatResponse {
    return rawResponse as UnifiedChatResponse;
  }
  public parseStreamChunk(rawChunk: unknown): UnifiedStreamChunk | null {
    return rawChunk as UnifiedStreamChunk;
  }
  protected async executeNativeInvoke(params: { formattedMessages: unknown }): Promise<unknown> {
    return this.invokeHandler(params.formattedMessages as UnifiedMessage[]);
  }
  protected async *executeNativeStream(): AsyncGenerator<unknown, void, unknown> {}
}

describe('Orchestration Strategies & Session Room', () => {
  const modelA = new MockChatModel(() => ({
    content: '你好，我是夏洛克。',
    role: 'assistant',
    model: 'mock',
    stopReason: 'stop',
    usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
  }));

  const modelB = new MockChatModel(() => ({
    content: '我是老管家，请问有什么事？',
    role: 'assistant',
    model: 'mock',
    stopReason: 'stop',
    usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
  }));

  describe('GroupChatOrchestrator (自由聊天室模式)', () => {
    it('should prioritize speaker when @mentioned in previous message', async () => {
      const orchestrator = new GroupChatOrchestrator();
      const room = new MultiAgentRoom({
        orchestrator,
        agents: [
          new RoleAgent({ id: 'sherlock', name: '夏洛克', persona: '侦探', model: modelA }),
          new RoleAgent({ id: 'butler', name: '老管家', persona: '管家', model: modelB }),
        ],
      });

      // 人类发送公聊并 @老管家
      await room.broadcast('玩家', '请问 @老管家 你昨晚几点睡的？');

      // 调度决断下一棒
      const decision = await orchestrator.selectNextSpeaker(room);
      expect(decision.nextSpeakerId).toBe('butler');
    });

    it('should alternate speakers avoiding self-talk in round-robin mode', async () => {
      const orchestrator = new GroupChatOrchestrator({ mode: 'round-robin' });
      const room = new MultiAgentRoom({
        orchestrator,
        agents: [
          new RoleAgent({ id: 'sherlock', name: '夏洛克', persona: '侦探', model: modelA }),
          new RoleAgent({ id: 'butler', name: '老管家', persona: '管家', model: modelB }),
        ],
      });

      // 夏洛克先说了一句话
      await room.broadcast('夏洛克', '现场有一只烟斗。', 'sherlock');

      const decision = await orchestrator.selectNextSpeaker(room);
      expect(decision.nextSpeakerId).toBe('butler'); // 不选刚发过言的夏洛克
    });
  });

  describe('DirectorOrchestrator (导演/DM控场模式)', () => {
    it('should query director model and route to designated speaker with stageHint', async () => {
      const directorModel = new MockChatModel(() => ({
        content: JSON.stringify({
          nextSpeakerId: 'butler',
          stageHint: '请管家说明银器藏在何处',
          shouldTerminate: false,
        }),
        role: 'assistant',
        model: 'director-mock',
        stopReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
      }));

      const orchestrator = new DirectorOrchestrator({ directorModel });
      const room = new MultiAgentRoom({
        orchestrator,
        agents: [
          new RoleAgent({ id: 'sherlock', name: '夏洛克', persona: '侦探', model: modelA }),
          new RoleAgent({ id: 'butler', name: '老管家', persona: '管家', model: modelB }),
        ],
      });

      const decision = await orchestrator.selectNextSpeaker(room);
      expect(decision.nextSpeakerId).toBe('butler');
      expect(decision.stageHint).toBe('请管家说明银器藏在何处');
      expect(decision.shouldTerminate).toBe(false);
    });
  });

  describe('PipelineOrchestrator (SOP任务流水线模式)', () => {
    it('should step through Planner -> Worker -> Reviewer sequentially', async () => {
      const orchestrator = new PipelineOrchestrator({
        plannerId: 'planner',
        workerIds: ['worker'],
        reviewerId: 'reviewer',
      });

      const room = new MultiAgentRoom({
        orchestrator,
        agents: [
          new RoleAgent({ id: 'planner', name: '规划者', persona: '规划', model: modelA }),
          new RoleAgent({ id: 'worker', name: '执行者', persona: '执行', model: modelB }),
          new RoleAgent({ id: 'reviewer', name: '审查者', persona: '审查', model: modelA }),
        ],
      });

      // Step 1: 必须是 Planner
      const d1 = await orchestrator.selectNextSpeaker(room);
      expect(d1.nextSpeakerId).toBe('planner');
      await room.broadcast('规划者', '任务拆解完毕。', 'planner');

      // Step 2: 必须是 Worker
      const d2 = await orchestrator.selectNextSpeaker(room);
      expect(d2.nextSpeakerId).toBe('worker');
      await room.broadcast('执行者', '代码已编写完成。', 'worker');

      // Step 3: 必须是 Reviewer
      const d3 = await orchestrator.selectNextSpeaker(room);
      expect(d3.nextSpeakerId).toBe('reviewer');
      await room.broadcast('审查者', '质量合格，准予通过。', 'reviewer');

      // Step 4: 终止
      const d4 = await orchestrator.selectNextSpeaker(room);
      expect(d4.shouldTerminate).toBe(true);
    });
  });

  describe('MultiAgentRoom Session Execution', () => {
    it('should drive single step correctly and publish room messages', async () => {
      const orchestrator = new GroupChatOrchestrator();
      const room = new MultiAgentRoom({
        orchestrator,
        agents: [
          new RoleAgent({ id: 'sherlock', name: '夏洛克', persona: '侦探', model: modelA }),
        ],
      });

      const stepRes = await room.step();
      expect(stepRes.terminated).toBe(false);
      expect(stepRes.message?.senderId).toBe('sherlock');
      expect(stepRes.message?.content).toBe('你好，我是夏洛克。');
      expect(room.roomMemory.getAllHistory()).toHaveLength(1);
    });
  });
});
