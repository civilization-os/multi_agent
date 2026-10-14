import type { IOrchestrator, NextSpeakerDecision } from '../base-orchestrator.js';
import type { MultiAgentRoom } from '../session-room.js';

export interface GroupChatOptions {
  mode?: 'round-robin' | 'random';
  maxConsecutiveTurns?: number;
}

/**
 * 策略 A：自由群聊发言编排器 (GroupChatOrchestrator)
 * 具备 @点名优先响应、轮流发言接龙与防自言自语过滤
 */
export class GroupChatOrchestrator implements IOrchestrator {
  public readonly name = 'GroupChat';
  private mode: 'round-robin' | 'random';
  private roundIndex = 0;
  private lastSpeakerId?: string;

  constructor(options: GroupChatOptions = {}) {
    this.mode = options.mode ?? 'round-robin';
  }

  public async selectNextSpeaker(room: MultiAgentRoom): Promise<NextSpeakerDecision> {
    const members = room.getMembers();
    if (members.length === 0) {
      return { shouldTerminate: true };
    }

    const history = room.roomMemory.getAllHistory();
    const lastMessage = history.length > 0 ? history[history.length - 1] : undefined;

    // 1. 【@点名优先机制】：若上一条发言中明确 @ 了特定在场成员，强制优先由被提及者接话
    if (lastMessage?.mentions && lastMessage.mentions.length > 0) {
      for (const mentionedId of lastMessage.mentions) {
        if (members.some((m) => m.id === mentionedId) && mentionedId !== lastMessage.senderId) {
          this.lastSpeakerId = mentionedId;
          return { nextSpeakerId: mentionedId };
        }
      }
    }

    // 2. 候选人池：过滤掉刚发过言的人，避免自问自答自言自语
    const candidateMembers =
      members.length > 1
        ? members.filter((m) => m.id !== lastMessage?.senderId)
        : members;

    let selectedId: string;

    if (this.mode === 'random') {
      const idx = Math.floor(Math.random() * candidateMembers.length);
      selectedId = candidateMembers[idx].id;
    } else {
      // 顺序轮询模式
      const member = candidateMembers[this.roundIndex % candidateMembers.length];
      this.roundIndex++;
      selectedId = member.id;
    }

    this.lastSpeakerId = selectedId;
    return { nextSpeakerId: selectedId };
  }
}
