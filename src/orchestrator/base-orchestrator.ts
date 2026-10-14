import type { MultiAgentRoom } from './session-room.js';

export interface NextSpeakerDecision {
  nextSpeakerId?: string;
  stageHint?: string;
  shouldTerminate?: boolean;
}

/**
 * 编排策略抽象接口 (IOrchestrator)
 * 场景无关的发言调度契约：决定谁在什么时候跟谁说话
 */
export interface IOrchestrator {
  readonly name: string;

  /**
   * 决定下一棒发言的智能体
   */
  selectNextSpeaker(room: MultiAgentRoom): Promise<NextSpeakerDecision>;
}
