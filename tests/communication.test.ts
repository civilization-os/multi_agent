import { describe, it, expect, vi } from 'vitest';
import {
  EventBus,
  MessageRouter,
  createRoomMessage,
  type LifecycleEvent,
} from '../src/index.js';

describe('Communication Subsystem (EventBus & Router)', () => {
  it('should deliver room messages only to agents within visible scope', async () => {
    const bus = new EventBus();
    const agent1Handler = vi.fn();
    const agent2Handler = vi.fn();

    bus.subscribe('agent-1', agent1Handler);
    bus.subscribe('agent-2', agent2Handler);

    // 私聊消息：仅 agent-2 与发送者可见
    const whisperMsg = createRoomMessage({
      roomId: 'room-test',
      senderId: 'sherlock',
      senderName: '夏洛克',
      content: '只有你能看到',
      visibility: 'WHISPER',
      visibleTo: ['agent-2'],
    });

    await bus.publishMessage(whisperMsg);

    expect(agent1Handler).not.toHaveBeenCalled();
    expect(agent2Handler).toHaveBeenCalledTimes(1);
    expect(agent2Handler).toHaveBeenCalledWith(whisperMsg);
  });

  it('should broadcast public message to all subscribed agents', async () => {
    const bus = new EventBus();
    const agent1Handler = vi.fn();
    const agent2Handler = vi.fn();

    bus.subscribe('agent-1', agent1Handler);
    bus.subscribe('agent-2', agent2Handler);

    const publicMsg = createRoomMessage({
      roomId: 'room-test',
      senderId: 'host',
      senderName: '主持人',
      content: '全员通告：天黑请闭眼。',
      visibility: 'PUBLIC',
    });

    await bus.publishMessage(publicMsg);

    expect(agent1Handler).toHaveBeenCalledTimes(1);
    expect(agent2Handler).toHaveBeenCalledTimes(1);
  });

  it('should extract @mentions for both name and id from text', () => {
    const members = [
      { id: 'butler_01', name: '老管家' },
      { id: 'anna', name: '女仆安娜' },
    ];

    const text1 = '请问 @老管家 你当时在哪里？';
    const mentions1 = MessageRouter.extractMentions(text1, members);
    expect(mentions1).toEqual(['butler_01']);

    const text2 = '呼叫 @anna 和 @老管家 过来开会';
    const mentions2 = MessageRouter.extractMentions(text2, members);
    expect(mentions2).toContain('anna');
    expect(mentions2).toContain('butler_01');
  });

  it('should emit and listen to lifecycle events', () => {
    const bus = new EventBus();
    const thinkingListener = vi.fn();
    const wildcardListener = vi.fn();

    bus.onLifecycle('agent:thinking', thinkingListener);
    bus.onLifecycle('*', wildcardListener);

    const ev: LifecycleEvent = {
      type: 'agent:thinking',
      roomId: 'room-001',
      agentId: 'sherlock',
      payload: { iteration: 1 },
      timestamp: Date.now(),
    };

    bus.emitLifecycle(ev);

    expect(thinkingListener).toHaveBeenCalledWith(ev);
    expect(wildcardListener).toHaveBeenCalledWith(ev);
  });
});
