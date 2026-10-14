import type { BaseChatModel } from '@civilization/model-core';
import { BaseAgent, type AgentExecutionOptions } from './base-agent.js';
import { AgentMemory } from '../memory/agent-memory.js';
import { PerspectiveRenderer } from '../memory/perspective.js';
import type { RoomMessage } from '../communication/protocol.js';
import type { RoomMemberInfo } from '../communication/router.js';
import type { Blackboard } from '../memory/blackboard.js';

export interface RoleAgentConfig {
  id: string;
  name: string;
  persona: string;
  secretContext?: string;
  model: BaseChatModel;
  tools?: string[];
  maxIterations?: number;
}

export interface RoleSpeakContext extends AgentExecutionOptions {
  roomHistory: RoomMessage[];
  members: RoomMemberInfo[];
  blackboard?: Blackboard;
}

export interface RoleSpeakResult {
  content: string;
  innerThought?: string;
  whisperTo?: string[];
}

/**
 * 通用角色智能体 (RoleAgent)
 * 场景无关的通用智能体实现：可用于聊天室对话、剧本杀扮演、桌游博弈或专业生产力任务
 */
export class RoleAgent extends BaseAgent {
  public readonly persona: string;
  public readonly privateMemory: AgentMemory;

  constructor(config: RoleAgentConfig) {
    super({
      id: config.id,
      name: config.name,
      model: config.model,
      allowedTools: config.tools,
      maxIterations: config.maxIterations,
    });

    this.persona = config.persona;
    this.privateMemory = new AgentMemory(config.id, config.secretContext);
  }

  /**
   * 基于当前房间局势发表一轮言论或采取行动
   */
  public async speak(context: RoleSpeakContext): Promise<RoleSpeakResult> {
    // 1. 将房间全员记录与私有记忆编译为第一人称统一输入
    const unifiedMessages = PerspectiveRenderer.toUnifiedMessages({
      agent: {
        id: this.id,
        name: this.name,
        persona: this.persona,
      },
      roomHistory: context.roomHistory,
      members: context.members,
      agentPrivateMemory: this.privateMemory,
      blackboard: context.blackboard,
    });

    // 2. 触发 ReAct 自循环调用
    const res = await this.executeReActLoop(unifiedMessages, {
      tools: context.tools,
      eventBus: context.eventBus,
      roomId: context.roomId,
      signal: context.signal,
    });

    return {
      content: res.content,
      innerThought: res.innerThought,
    };
  }
}
