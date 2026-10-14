import { nanoid } from 'nanoid';
import { EventBus } from '../communication/event-bus.js';
import { RoomMemory } from '../memory/room-memory.js';
import { Blackboard } from '../memory/blackboard.js';
import { ToolRegistry } from '../tools/registry.js';
import { MessageRouter, type RoomMemberInfo } from '../communication/router.js';
import { createRoomMessage, type RoomMessage } from '../communication/protocol.js';
import type { RoleAgent } from '../agents/role.agent.js';
import type { IOrchestrator } from './base-orchestrator.js';

export interface MultiAgentRoomConfig {
  roomId?: string;
  orchestrator: IOrchestrator;
  agents?: RoleAgent[];
  toolRegistry?: ToolRegistry;
  eventBus?: EventBus;
}

/**
 * 通用多智能体房间/会话容器 (MultiAgentRoom)
 * 承载多智能体协同运行态，集成成员、记忆、黑板、工具与事件总线
 */
export class MultiAgentRoom {
  public readonly roomId: string;
  private agents = new Map<string, RoleAgent>();
  public readonly roomMemory: RoomMemory;
  public readonly blackboard: Blackboard;
  public readonly eventBus: EventBus;
  public readonly toolRegistry: ToolRegistry;
  public orchestrator: IOrchestrator;

  constructor(config: MultiAgentRoomConfig) {
    this.roomId = config.roomId ?? `room-${nanoid(8)}`;
    this.orchestrator = config.orchestrator;
    this.roomMemory = new RoomMemory(this.roomId);
    this.blackboard = new Blackboard(this.roomId);
    this.eventBus = config.eventBus ?? new EventBus();
    this.toolRegistry = config.toolRegistry ?? new ToolRegistry();

    if (config.agents) {
      for (const agent of config.agents) {
        this.registerAgent(agent);
      }
    }
  }

  /**
   * 注册加入房间的智能体
   */
  public registerAgent(agent: RoleAgent): this {
    this.agents.set(agent.id, agent);
    return this;
  }

  public getAgent(agentId: string): RoleAgent | undefined {
    return this.agents.get(agentId);
  }

  public getMembers(): RoomMemberInfo[] {
    return Array.from(this.agents.values()).map((a) => ({
      id: a.id,
      name: a.name,
    }));
  }

  /**
   * 广播公聊消息（如人类玩家插话或系统通知）
   */
  public async broadcast(
    senderName: string,
    content: string,
    senderId = 'USER'
  ): Promise<RoomMessage> {
    const mentions = MessageRouter.extractMentions(content, this.getMembers());
    const msg = createRoomMessage({
      roomId: this.roomId,
      senderId,
      senderName,
      content,
      visibility: 'PUBLIC',
      mentions,
    });

    this.roomMemory.addMessage(msg);
    await this.eventBus.publishMessage(msg);
    return msg;
  }

  /**
   * 发起多方或点对点私聊 (WHISPER)
   */
  public async whisper(
    senderId: string,
    senderName: string,
    targetIds: string[],
    content: string
  ): Promise<RoomMessage> {
    const msg = createRoomMessage({
      roomId: this.roomId,
      senderId,
      senderName,
      content,
      visibility: 'WHISPER',
      visibleTo: targetIds,
    });

    this.roomMemory.addMessage(msg);
    await this.eventBus.publishMessage(msg);
    return msg;
  }

  /**
   * 注入特定智能体专属的系统密令/线索纸条 (PRIVATE_SYSTEM)
   */
  public async injectSecretNote(
    targetAgentId: string,
    note: string,
    senderName = '系统密令'
  ): Promise<RoomMessage> {
    const msg = createRoomMessage({
      roomId: this.roomId,
      senderId: 'SYSTEM',
      senderName,
      content: note,
      visibility: 'PRIVATE_SYSTEM',
      visibleTo: [targetAgentId],
    });

    this.roomMemory.addMessage(msg);
    await this.eventBus.publishMessage(msg);
    return msg;
  }

  /**
   * 推进一轮单步发言 (Step)
   */
  public async step(): Promise<{ message?: RoomMessage; terminated: boolean }> {
    // 1. 由编排策略决断下一棒发言人
    const decision = await this.orchestrator.selectNextSpeaker(this);

    if (decision.shouldTerminate || !decision.nextSpeakerId) {
      return { terminated: true };
    }

    const speaker = this.agents.get(decision.nextSpeakerId);
    if (!speaker) {
      console.warn(`[MultiAgentRoom] Speaker '${decision.nextSpeakerId}' not found in room.`);
      return { terminated: true };
    }

    // 若编排器给出了专属 stageHint 提示词，以系统密令注入该 speaker 的可见视野
    if (decision.stageHint) {
      await this.injectSecretNote(speaker.id, decision.stageHint, '控场提示');
    }

    this.eventBus.emitLifecycle({
      type: 'orchestrator:turn',
      roomId: this.roomId,
      agentId: speaker.id,
      payload: { speakerName: speaker.name },
      timestamp: Date.now(),
    });

    // 2. 提取该 Speaker 视角下的可见历史
    const visibleHistory = this.roomMemory.getVisibleHistory(speaker.id);

    // 3. 驱动智能体发声
    const speakResult = await speaker.speak({
      roomHistory: visibleHistory,
      members: this.getMembers(),
      blackboard: this.blackboard,
      tools: this.toolRegistry,
      eventBus: this.eventBus,
      roomId: this.roomId,
    });

    // 4. 解析 @ 提及与可见性
    const mentions = MessageRouter.extractMentions(speakResult.content, this.getMembers());
    const isWhisper = Boolean(speakResult.whisperTo && speakResult.whisperTo.length > 0);

    const message = createRoomMessage({
      roomId: this.roomId,
      senderId: speaker.id,
      senderName: speaker.name,
      content: speakResult.content,
      innerThought: speakResult.innerThought,
      visibility: isWhisper ? 'WHISPER' : 'PUBLIC',
      visibleTo: speakResult.whisperTo,
      mentions,
    });

    this.roomMemory.addMessage(message);
    await this.eventBus.publishMessage(message);

    return { message, terminated: false };
  }

  /**
   * 循环驱动会话推进
   */
  public async run(
    initialPrompt?: string,
    maxTurns = 20
  ): Promise<{ turnCount: number; history: RoomMessage[] }> {
    if (initialPrompt) {
      await this.broadcast('主持人/系统', initialPrompt, 'SYSTEM');
    }

    let turnCount = 0;
    while (turnCount < maxTurns) {
      turnCount++;
      const res = await this.step();
      if (res.terminated) {
        break;
      }
    }

    this.eventBus.emitLifecycle({
      type: 'room:completed',
      roomId: this.roomId,
      payload: { turnCount },
      timestamp: Date.now(),
    });

    return {
      turnCount,
      history: this.roomMemory.getAllHistory(),
    };
  }
}
