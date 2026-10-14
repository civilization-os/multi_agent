import type { RoomMessage } from './protocol.js';

export interface RoomMemberInfo {
  id: string;
  name: string;
}

/**
 * 房间消息与视野路由器
 */
export class MessageRouter {
  /**
   * 从发言正文中自动提取 @提及 的智能体 ID 列表
   * 例如正文：“你好 @老管家 ，请问昨晚书房门锁了吗？”，匹配出老管家的 agentId
   */
  public static extractMentions(content: string, members: RoomMemberInfo[]): string[] {
    if (!content || !content.includes('@')) {
      return [];
    }

    const mentionedIds = new Set<string>();

    for (const member of members) {
      // 匹配 @角色名 或 @agentId (支持中英文字符边界)
      const namePattern = new RegExp(`@${member.name}\\b|@${member.name}(?=[\\s,，。！？!?:：]|$)`, 'i');
      const idPattern = new RegExp(`@${member.id}\\b|@${member.id}(?=[\\s,，。！？!?:：]|$)`, 'i');

      if (namePattern.test(content) || idPattern.test(content)) {
        mentionedIds.add(member.id);
      }
    }

    return Array.from(mentionedIds);
  }

  /**
   * 判断一条消息对特定 Agent 是否可见
   * - PUBLIC: 全员可见
   * - WHISPER / PRIVATE_SYSTEM: 仅 visibleTo 包含 agentId 时可见
   */
  public static isMessageVisibleTo(message: RoomMessage, agentId: string): boolean {
    if (message.visibility === 'PUBLIC') {
      return true;
    }

    if (!message.visibleTo || message.visibleTo.length === 0) {
      return false;
    }

    return message.visibleTo.includes(agentId);
  }
}
