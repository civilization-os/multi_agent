import { nanoid } from 'nanoid';

/**
 * 消息可见性范围
 * - PUBLIC: 全员可见（房间内所有 Agent 与玩家均可接收）
 * - WHISPER: 私聊/阵营悄悄话（仅指定收件人可见，自动包含发送者）
 * - PRIVATE_SYSTEM: 系统/主持人密令（仅目标接收者可见，如剧本杀发线索卡或导演提示）
 */
export type VisibilityScope = 'PUBLIC' | 'WHISPER' | 'PRIVATE_SYSTEM';

/**
 * 房间消息信封契约
 */
export interface RoomMessage {
  id: string;
  roomId: string;
  senderId: string;               // 发送者 ID ('SYSTEM' 或具体 Agent ID 或人类玩家 ID)
  senderName: string;             // 显示名称 (如 '老管家', '神探夏洛克', '旁白/主持人')
  visibility: VisibilityScope;    // 可见范围
  visibleTo?: string[];           // 当 visibility !== 'PUBLIC' 时指定可见的目标 ID 列表 (自动包含 senderId)
  content: string;                // 发言正文
  innerThought?: string;          // 角色内心独白/思考过程 (仅自己与上帝视角可见，其他 Agent 绝对不可见)
  mentions?: string[];            // 自动解析的正文中 @提及 的 Agent ID 或角色名列表
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * 创建房间消息的工厂辅助函数
 */
export function createRoomMessage(params: {
  roomId: string;
  senderId: string;
  senderName: string;
  content: string;
  visibility?: VisibilityScope;
  visibleTo?: string[];
  innerThought?: string;
  mentions?: string[];
  metadata?: Record<string, unknown>;
  id?: string;
}): RoomMessage {
  const visibility = params.visibility ?? 'PUBLIC';
  const visibleTo = params.visibleTo ? [...params.visibleTo] : [];

  // 如果是私聊，确保发送者自己也在可见列表中
  if (visibility !== 'PUBLIC' && !visibleTo.includes(params.senderId)) {
    visibleTo.push(params.senderId);
  }

  return {
    id: params.id ?? nanoid(),
    roomId: params.roomId,
    senderId: params.senderId,
    senderName: params.senderName,
    visibility,
    visibleTo: visibility !== 'PUBLIC' ? visibleTo : undefined,
    content: params.content,
    innerThought: params.innerThought,
    mentions: params.mentions,
    timestamp: Date.now(),
    metadata: params.metadata,
  };
}

/**
 * 房间生命周期与流式事件类型
 */
export type LifecycleEventType =
  | 'room:message'        // 房间产生新发言
  | 'agent:thinking'      // 智能体开始思考/产生推理
  | 'agent:stream_chunk'  // 智能体流式切片输出
  | 'agent:tool_call'     // 智能体发起行动/调用技能
  | 'agent:tool_result'   // 动作或工具返回结果
  | 'orchestrator:turn'   // 编排器切换到下一轮发言人
  | 'room:completed';     // 房间会话/剧本结束

export interface LifecycleEvent<TPayload = unknown> {
  type: LifecycleEventType;
  roomId: string;
  agentId?: string;
  payload: TPayload;
  timestamp: number;
}
