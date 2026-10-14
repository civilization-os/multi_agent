import type { RoomMessage } from '../communication/protocol.js';
import { MessageRouter } from '../communication/router.js';

/**
 * 房间消息历史管理器 (RoomMemory)
 * 记录房间全量对话流水，按视角与可见性范围向特定 Agent 提供安全视图
 */
export class RoomMemory {
  private messages: RoomMessage[] = [];
  public readonly roomId: string;

  constructor(roomId: string) {
    this.roomId = roomId;
  }

  /**
   * 追加一条房间消息
   */
  public addMessage(message: RoomMessage): void {
    this.messages.push(message);
  }

  /**
   * 获取对指定 Agent 可见的合法历史记录
   * 【核心隐私防护】：
   * 1. 过滤掉未授权的私聊 (WHISPER) 与密令 (PRIVATE_SYSTEM)
   * 2. 绝不泄露他人的 innerThought（内心独白）！若消息来自他人，将 innerThought 清空
   */
  public getVisibleHistory(agentId: string): RoomMessage[] {
    const visible: RoomMessage[] = [];

    for (const msg of this.messages) {
      if (!MessageRouter.isMessageVisibleTo(msg, agentId)) {
        continue;
      }

      // 如果是本人发言，保留全部（含自己的 innerThought）；如果是他人发言，剥离 innerThought
      if (msg.senderId === agentId) {
        visible.push({ ...msg });
      } else {
        visible.push({
          ...msg,
          innerThought: undefined, // 严格隔离他人心声
        });
      }
    }

    return visible;
  }

  /**
   * 获取房间全量原始流水 (仅供主持人/DM/审计使用)
   */
  public getAllHistory(): RoomMessage[] {
    return [...this.messages];
  }

  /**
   * 清空消息历史
   */
  public clear(): void {
    this.messages = [];
  }

  public size(): number {
    return this.messages.length;
  }
}
