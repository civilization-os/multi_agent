import type { RoomMessage, LifecycleEvent, LifecycleEventType } from './protocol.js';
import { MessageRouter } from './router.js';

export type MessageHandler = (message: RoomMessage) => Promise<void> | void;
export type LifecycleHandler = (event: LifecycleEvent) => void;

/**
 * 通用多智能体异步事件总线
 */
export class EventBus {
  private agentSubscriptions = new Map<string, Set<MessageHandler>>();
  private globalMessageListeners = new Set<MessageHandler>();
  private lifecycleListeners = new Map<string, Set<LifecycleHandler>>();

  /**
   * 订阅针对特定智能体的消息（自动过滤该智能体不可见的私密消息）
   */
  public subscribe(agentId: string, handler: MessageHandler): () => void {
    if (!this.agentSubscriptions.has(agentId)) {
      this.agentSubscriptions.set(agentId, new Set());
    }
    this.agentSubscriptions.get(agentId)!.add(handler);

    return () => {
      this.agentSubscriptions.get(agentId)?.delete(handler);
    };
  }

  /**
   * 监听房间内所有消息（通常用于上帝视角、监控审计面板或落库）
   */
  public onAnyMessage(handler: MessageHandler): () => void {
    this.globalMessageListeners.add(handler);
    return () => {
      this.globalMessageListeners.delete(handler);
    };
  }

  /**
   * 在房间中广播或私聊投递一条消息
   */
  public async publishMessage(message: RoomMessage): Promise<void> {
    const promises: Promise<void>[] = [];

    // 1. 触发上帝视角全局监听器
    for (const listener of this.globalMessageListeners) {
      try {
        const res = listener(message);
        if (res instanceof Promise) {
          promises.push(res.catch((err) => console.error('[EventBus] Global listener error:', err)));
        }
      } catch (err) {
        console.error('[EventBus] Global listener error:', err);
      }
    }

    // 2. 视野安全过滤分发给订阅的 Agent
    for (const [agentId, handlers] of this.agentSubscriptions.entries()) {
      // 安全检查：该消息是否对该 Agent 可见
      if (!MessageRouter.isMessageVisibleTo(message, agentId)) {
        continue;
      }

      for (const handler of handlers) {
        try {
          const res = handler(message);
          if (res instanceof Promise) {
            promises.push(
              res.catch((err) => console.error(`[EventBus] Handler error for ${agentId}:`, err))
            );
          }
        } catch (err) {
          console.error(`[EventBus] Handler error for ${agentId}:`, err);
        }
      }
    }

    await Promise.all(promises);
  }

  /**
   * 发射生命周期事件
   */
  public emitLifecycle(event: LifecycleEvent): void {
    const specific = this.lifecycleListeners.get(event.type);
    if (specific) {
      for (const fn of specific) {
        try {
          fn(event);
        } catch (err) {
          console.error(`[EventBus] Lifecycle listener error on ${event.type}:`, err);
        }
      }
    }

    const wildcard = this.lifecycleListeners.get('*');
    if (wildcard) {
      for (const fn of wildcard) {
        try {
          fn(event);
        } catch (err) {
          console.error('[EventBus] Wildcard lifecycle listener error:', err);
        }
      }
    }
  }

  /**
   * 监听生命周期事件
   */
  public onLifecycle(typeOrAll: LifecycleEventType | '*', handler: LifecycleHandler): () => void {
    if (!this.lifecycleListeners.has(typeOrAll)) {
      this.lifecycleListeners.set(typeOrAll, new Set());
    }
    this.lifecycleListeners.get(typeOrAll)!.add(handler);

    return () => {
      this.lifecycleListeners.get(typeOrAll)?.delete(handler);
    };
  }
}
