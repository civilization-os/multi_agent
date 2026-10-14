import type { BaseChatModel } from '@civilization/model-core';
import type { IOrchestrator, NextSpeakerDecision } from '../base-orchestrator.js';
import type { MultiAgentRoom } from '../session-room.js';

export interface DirectorOptions {
  directorModel: BaseChatModel;
  scenarioBrief?: string;
  systemPrompt?: string;
}

const DEFAULT_DIRECTOR_PROMPT = `你是一位精通故事叙事、节奏推进与剧场舞台调度的资深导演/跑团主持人(DM)。
你的核心职责是观察全场多智能体的发言进展，根据剧情悬念与交流焦点，精准调度下一位最应该发言的角色，并向其提供专属的暗中引导提示词(stageHint)。

【输出格式严格规范】：
你必须且仅能输出一个纯净的 JSON 对象：
{
  "nextSpeakerId": "下一位该发言的角色ID",
  "stageHint": "暗中提供给该角色的临时引导提示(如：请解释案发时你为何出现在走廊)",
  "shouldTerminate": false
}
`;

/**
 * 策略 B：导演/DM 控场编排器 (DirectorOrchestrator)
 */
export class DirectorOrchestrator implements IOrchestrator {
  public readonly name = 'Director';
  private directorModel: BaseChatModel;
  private scenarioBrief?: string;
  private systemPrompt: string;

  constructor(options: DirectorOptions) {
    this.directorModel = options.directorModel;
    this.scenarioBrief = options.scenarioBrief;
    this.systemPrompt = options.systemPrompt ?? DEFAULT_DIRECTOR_PROMPT;
  }

  public async selectNextSpeaker(room: MultiAgentRoom): Promise<NextSpeakerDecision> {
    const members = room.getMembers();
    if (members.length === 0) {
      return { shouldTerminate: true };
    }

    const history = room.roomMemory.getAllHistory();
    const recentHistory = history.slice(-8); // 取最近 8 条对话作为剧情上下文

    const historyLines = recentHistory.map(
      (m) => `[${m.senderName}]: ${m.content.slice(0, 150)}`
    );

    const prompt = [
      this.scenarioBrief ? `【剧本背景/任务目标】:\n${this.scenarioBrief}\n` : '',
      `【在场候选角色名单】:`,
      members.map((m) => `  - ${m.name} (ID: ${m.id})`).join('\n'),
      `\n【近期对话流水】:`,
      historyLines.length > 0 ? historyLines.join('\n') : '(场上尚未有人发言)',
      `\n请作为导演做出调度裁决，输出指定的纯 JSON 对象。`,
    ].join('\n');

    try {
      const response = await this.directorModel.invoke([
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: prompt },
      ]);

      return this.parseDecisionJson(response.content, members);
    } catch {
      // 容错兜底：若导演模型调用异常，回退至首位有效角色
      return { nextSpeakerId: members[0].id };
    }
  }

  private parseDecisionJson(
    rawText: string,
    members: Array<{ id: string; name: string }>
  ): NextSpeakerDecision {
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }

    try {
      const parsed = JSON.parse(cleaned);
      if (typeof parsed === 'object' && parsed !== null) {
        const nextId = String(parsed.nextSpeakerId || '');
        const validMember = members.find((m) => m.id === nextId || m.name === nextId);

        return {
          nextSpeakerId: validMember ? validMember.id : members[0].id,
          stageHint: parsed.stageHint ? String(parsed.stageHint) : undefined,
          shouldTerminate: Boolean(parsed.shouldTerminate),
        };
      }
    } catch {
      // 容错兜底
    }

    return { nextSpeakerId: members[0].id };
  }
}
