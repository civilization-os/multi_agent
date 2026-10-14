import { describe, it, expect } from 'vitest';
import {
  PerspectiveRenderer,
  RoomMemory,
  AgentMemory,
  Blackboard,
  createRoomMessage,
  type RoomMessage,
} from '../src/index.js';

describe('Perspective & Visibility Isolation (视角转换与视野隔离)', () => {
  const members = [
    { id: 'sherlock', name: '夏洛克' },
    { id: 'butler', name: '老管家' },
    { id: 'maid', name: '女仆安娜' },
  ];

  describe('RoomMemory Visibility & Thought Isolation', () => {
    it('should only return public and authorized whisper/system messages to agent', () => {
      const memory = new RoomMemory('room-1');

      // 1. 公聊
      memory.addMessage(
        createRoomMessage({
          roomId: 'room-1',
          senderId: 'sherlock',
          senderName: '夏洛克',
          content: '昨晚10点谁在走廊？',
          visibility: 'PUBLIC',
        })
      );

      // 2. 夏洛克与女仆的私聊（老管家不可见）
      memory.addMessage(
        createRoomMessage({
          roomId: 'room-1',
          senderId: 'sherlock',
          senderName: '夏洛克',
          content: '安娜，你当时看到老管家了吗？',
          visibility: 'WHISPER',
          visibleTo: ['sherlock', 'maid'],
        })
      );

      // 3. 针对老管家的系统密令
      memory.addMessage(
        createRoomMessage({
          roomId: 'room-1',
          senderId: 'SYSTEM',
          senderName: '系统密令',
          content: '你昨晚掉落了一把钥匙，被探长捡到了。',
          visibility: 'PRIVATE_SYSTEM',
          visibleTo: ['butler'],
        })
      );

      // 验证老管家的可见视角
      const butlerView = memory.getVisibleHistory('butler');
      expect(butlerView).toHaveLength(2); // 公聊 + 自己的密令，不含夏洛克和女仆的私聊
      expect(butlerView[0].content).toBe('昨晚10点谁在走廊？');
      expect(butlerView[1].content).toContain('你昨晚掉落了一把钥匙');

      // 验证女仆的可见视角
      const maidView = memory.getVisibleHistory('maid');
      expect(maidView).toHaveLength(2); // 公聊 + 私聊，不含老管家的密令
      expect(maidView[1].content).toContain('安娜，你当时看到老管家了吗？');
    });

    it('should strictly isolate innerThought from other agents', () => {
      const memory = new RoomMemory('room-2');

      memory.addMessage(
        createRoomMessage({
          roomId: 'room-2',
          senderId: 'butler',
          senderName: '老管家',
          content: '我昨晚一直在仆人房睡觉。',
          innerThought: '千万不能让他们知道我曾去过书房！',
          visibility: 'PUBLIC',
        })
      );

      // 夏洛克视角：能看到发言正文，但绝对看不到老管家的内心独白！
      const sherlockView = memory.getVisibleHistory('sherlock');
      expect(sherlockView[0].content).toBe('我昨晚一直在仆人房睡觉。');
      expect(sherlockView[0].innerThought).toBeUndefined();

      // 老管家本人视角：保留自己的内心独白
      const butlerSelfView = memory.getVisibleHistory('butler');
      expect(butlerSelfView[0].innerThought).toBe('千万不能让他们知道我曾去过书房！');
    });
  });

  describe('PerspectiveRenderer First-Person Projection', () => {
    it('should map self messages to assistant and others to user with prefix tags', () => {
      const agent = {
        id: 'sherlock',
        name: '夏洛克',
        persona: '你是一位冷静敏锐的侦探。',
      };

      const history: RoomMessage[] = [
        createRoomMessage({
          roomId: 'r1',
          senderId: 'butler',
          senderName: '老管家',
          content: '老爷平时待我很好。',
          visibility: 'PUBLIC',
        }),
        createRoomMessage({
          roomId: 'r1',
          senderId: 'sherlock',
          senderName: '夏洛克',
          content: '请详细说明昨晚的具体行踪。',
          visibility: 'PUBLIC',
        }),
        createRoomMessage({
          roomId: 'r1',
          senderId: 'butler',
          senderName: '老管家',
          content: '我昨晚11点在擦拭银器。',
          visibility: 'PUBLIC',
        }),
      ];

      const unified = PerspectiveRenderer.toUnifiedMessages({
        agent,
        roomHistory: history,
        members,
      });

      // 第 0 条为第一人称 System Prompt
      expect(unified[0].role).toBe('system');
      expect(unified[0].content).toContain('你是一位冷静敏锐的侦探');

      // 他人发言转为 user 并带标签
      expect(unified[1].role).toBe('user');
      expect(unified[1].content).toContain('[公聊][老管家]: 老爷平时待我很好。');

      // 自身发言转为 assistant，纯正文无前缀标签
      expect(unified[2].role).toBe('assistant');
      expect(unified[2].content).toBe('请详细说明昨晚的具体行踪。');

      // 他人后续发言转为 user
      expect(unified[3].role).toBe('user');
      expect(unified[3].content).toContain('[公聊][老管家]: 我昨晚11点在擦拭银器。');
    });

    it('should merge consecutive same-role user turns for model compatibility', () => {
      const agent = {
        id: 'sherlock',
        name: '夏洛克',
        persona: '侦探',
      };

      // 连续多位他人的发言
      const history: RoomMessage[] = [
        createRoomMessage({
          roomId: 'r2',
          senderId: 'butler',
          senderName: '老管家',
          content: '我先发言。',
          visibility: 'PUBLIC',
        }),
        createRoomMessage({
          roomId: 'r2',
          senderId: 'maid',
          senderName: '女仆安娜',
          content: '我也说一句。',
          visibility: 'PUBLIC',
        }),
      ];

      const unified = PerspectiveRenderer.toUnifiedMessages({
        agent,
        roomHistory: history,
        members,
      });

      // 除了第 0 条 system，后续连续两个他人的 user 消息应该被合并为一条 user 消息
      expect(unified).toHaveLength(2);
      expect(unified[1].role).toBe('user');
      expect(unified[1].content).toContain('[公聊][老管家]: 我先发言。');
      expect(unified[1].content).toContain('[公聊][女仆安娜]: 我也说一句。');
    });

    it('should inject secretContext and blackboard clues into system prompt', () => {
      const agent = {
        id: 'butler',
        name: '老管家',
        persona: '表面恭顺但心中有鬼',
      };

      const privateMemory = new AgentMemory('butler', '你是真正的凶手，凶器藏在花盆里。');
      privateMemory.addPrivateNote('安娜曾撞见你洗手上的血迹');

      const blackboard = new Blackboard('r3');
      blackboard.setStage('FIRST_ROUND_DEBATE');
      blackboard.addPublicClue('血衣', '在走廊尽头发现一件染血围裙');

      const unified = PerspectiveRenderer.toUnifiedMessages({
        agent,
        roomHistory: [],
        members,
        agentPrivateMemory: privateMemory,
        blackboard,
      });

      const systemContent = unified[0].content;
      expect(systemContent).toContain('你是真正的凶手，凶器藏在花盆里');
      expect(systemContent).toContain('安娜曾撞见你洗手上的血迹');
      expect(systemContent).toContain('FIRST_ROUND_DEBATE');
      expect(systemContent).toContain('血衣');
    });
  });
});
