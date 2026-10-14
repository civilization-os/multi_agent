import type { UnifiedMessage } from '@civilization/model-core';
import type { RoomMessage } from '../communication/protocol.js';
import type { RoomMemberInfo } from '../communication/router.js';
import type { AgentMemory } from './agent-memory.js';
import type { Blackboard } from './blackboard.js';

export interface PerspectiveRenderOptions {
  agent: {
    id: string;
    name: string;
    persona: string;
  };
  roomHistory: RoomMessage[];
  members: RoomMemberInfo[];
  agentPrivateMemory?: AgentMemory;
  blackboard?: Blackboard;
}

/**
 * 第一人称视角渲染器 (PerspectiveRenderer)
 * 将多人群聊/私聊流水转换为面向特定 Agent 底层模型的纯净 UnifiedMessage[]
 */
export class PerspectiveRenderer {
  /**
   * 执行第一人称视角渲染
   */
  public static toUnifiedMessages(options: PerspectiveRenderOptions): UnifiedMessage[] {
    const { agent, roomHistory, members, agentPrivateMemory, blackboard } = options;

    // 1. 构建第一人称 System Prompt
    const systemPrompt = this.buildSystemPrompt(agent, members, agentPrivateMemory, blackboard);
    const result: UnifiedMessage[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
    ];

    // 2. 转换历史发言为模型视角
    const rawTurns: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    for (const msg of roomHistory) {
      if (msg.senderId === agent.id) {
        // 自身历史发言 -> assistant
        rawTurns.push({
          role: 'assistant',
          content: msg.content,
        });
      } else {
        // 他人发言或系统消息 -> user
        let formattedText = '';
        if (msg.visibility === 'PUBLIC') {
          formattedText = `[公聊][${msg.senderName}]: ${msg.content}`;
        } else if (msg.visibility === 'WHISPER') {
          formattedText = `[私聊][${msg.senderName} 悄悄对你说]: ${msg.content}`;
        } else if (msg.visibility === 'PRIVATE_SYSTEM') {
          formattedText = `[系统密令/仅你可见]: ${msg.content}`;
        }

        rawTurns.push({
          role: 'user',
          content: formattedText,
        });
      }
    }

    // 3. 【核心兼容】：连续同角色消息安全合并 (保障 Claude/Gemini/OpenAI 纯粹交替)
    const mergedTurns: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    for (const turn of rawTurns) {
      if (mergedTurns.length === 0) {
        mergedTurns.push({ ...turn });
        continue;
      }

      const prev = mergedTurns[mergedTurns.length - 1];
      if (prev.role === turn.role) {
        // 连续相同角色（例如连续三位他人发言），按双换行合并
        prev.content += `\n\n${turn.content}`;
      } else {
        mergedTurns.push({ ...turn });
      }
    }

    // 4. 边界处理：确保最后一轮是 user，引导模型进行接话
    if (mergedTurns.length === 0) {
      mergedTurns.push({
        role: 'user',
        content: '[系统提示]: 会话已开启，请开始你的第一轮发言。',
      });
    } else if (mergedTurns[mergedTurns.length - 1].role === 'assistant') {
      mergedTurns.push({
        role: 'user',
        content: '[系统提示]: 轮到你继续发言或采取行动了。',
      });
    }

    // 组装最终 UnifiedMessage[]
    for (const turn of mergedTurns) {
      result.push({
        role: turn.role,
        content: turn.content,
      });
    }

    return result;
  }

  /**
   * 组装结构化 System 指令
   */
  private static buildSystemPrompt(
    agent: { id: string; name: string; persona: string },
    members: RoomMemberInfo[],
    agentPrivateMemory?: AgentMemory,
    blackboard?: Blackboard
  ): string {
    const memberLines = members.map((m) => `  - ${m.name} (ID: ${m.id})`).join('\n');
    const secret = agentPrivateMemory?.getSecretContext();
    const notes = agentPrivateMemory?.getPrivateNotes() || [];
    const blackboardSummary = blackboard ? blackboard.renderSummary() : '';

    const sections: string[] = [
      `【你的角色身份】: ${agent.name} (ID: ${agent.id})`,
      `【你的核心人设与行动目标】:\n${agent.persona}`,
      `【房间当前成员名单】:\n${memberLines || '  (暂无其他成员)'}`,
    ];

    if (secret) {
      sections.push(
        `【你的专属秘密底牌/非公开信息(仅你自己可知，绝对不要随意向他人和盘托出)】:\n${secret}`
      );
    }

    if (notes.length > 0) {
      sections.push(`【你的私人便签与线索记录】:\n${notes.map((n) => `  * ${n}`).join('\n')}`);
    }

    if (blackboardSummary) {
      sections.push(`【公共黑板共知信息】:\n${blackboardSummary}`);
    }

    sections.push(
      `【发言准则】：\n` +
      `1. 请沉浸式扮演你的角色，以第一人称进行发言或采取行动；\n` +
      `2. 直接输出你所说的话或内心独白，严禁在发言前添加 "[${agent.name}]:" 之类的名字前缀标签！\n` +
      `3. 谨防身份混淆：他人说的话会带有 "[姓名]:" 标记，那是别人的发言，不是你的发言。`
    );

    return sections.join('\n\n');
  }
}
