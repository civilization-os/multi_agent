/**
 * 示例 1：剧本杀/侦探审讯室 (Murder Mystery Room)
 * 演示：
 * 1. 视野隔离：老管家与女仆持有专属私密底牌（对方不可见）
 * 2. 行动工具：侦探拥有 `inspect_alibi` 与 `search_clues` 技能
 * 3. 导演控场：DirectorOrchestrator 动态调度发言与注入阶段密令
 */

import { z } from 'zod';
import { createChatModel } from '@civilization/model-core';
import {
  MultiAgentRoom,
  RoleAgent,
  DirectorOrchestrator,
  ToolRegistry,
  defineTool,
} from '../src/index.js';

async function runMurderMystery() {
  console.log('========================================================');
  console.log('   🎭 暴风雪山庄：剧本杀多智能体博弈演示');
  console.log('========================================================\n');

  const apiKey = process.env.DEEPSEEK_API_KEY || 'sk-ec0c9302b0a64e59b6f94232b3f3ffa3';
  const baseURL = 'https://api.deepseek.com';

  const sharedModel = createChatModel({
    category: 'protocol',
    protocol: 'openai-compatible',
    modelName: 'deepseek-chat',
    baseURL,
    apiKey,
  });

  // 1. 挂载搜证工具 (作为角色可自主调用的技能)
  const toolRegistry = new ToolRegistry();
  toolRegistry.register(
    defineTool({
      name: 'search_scene_clues',
      description: '搜查案发现场（书房、花园、仆人房）获取物证',
      parameters: z.object({
        location: z.enum(['书房', '花园', '仆人房']).describe('搜查地点'),
      }),
      execute: async ({ location }) => {
        if (location === '花园') {
          return { item: '染血的短刀', detail: '埋在郁金香花丛泥土中，柄上有刻痕。' };
        }
        if (location === '书房') {
          return { item: '撕毁的遗嘱', detail: '保险柜被打开，遗嘱草稿被撕掉半截。' };
        }
        return { item: '空水杯', detail: '桌上有未洗的红茶杯。' };
      },
    })
  );

  // 2. 创建三大角色（携带各自秘密底牌）
  const detective = new RoleAgent({
    id: 'sherlock',
    name: '神探夏洛克',
    persona: '你是一位冷静严谨、洞察力极强的大侦探。你的唯一目标是找出杀害伯爵的真凶，善于抓住他人话语中的破绽并使用搜查技能。',
    model: sharedModel,
    tools: ['search_scene_clues'],
  });

  const butler = new RoleAgent({
    id: 'butler',
    name: '老管家约翰',
    persona: '你侍奉伯爵三十年，表面忠心耿耿、言辞温和恭顺，但内心惶恐不安。若被指责，会找理由辩解。',
    secretContext: '【绝密底牌】：你就是杀害伯爵的凶手！昨晚11点你在书房用短刀刺死了他，并将短刀埋在了花园郁金香丛中。你绝对不能主动承认，要想办法把嫌疑推给女仆。',
    model: sharedModel,
  });

  const maid = new RoleAgent({
    id: 'anna',
    name: '女仆安娜',
    persona: '年轻胆小、在庄园工作不满一年的女仆，说话有些怯懦，但生性善良。',
    secretContext: '【私密线索】：你昨晚11点15分在走廊倒水时，亲眼看见老管家神色慌张地从后门走回仆人房，他的袖口似乎有一点暗红色的污渍。',
    model: sharedModel,
  });

  // 3. 构建剧本杀控场导演 (DM)
  const directorOrchestrator = new DirectorOrchestrator({
    directorModel: sharedModel,
    scenarioBrief: '昨夜暴风雪中，庄园主罗伯特伯爵在书房遇刺身亡。现在大厅内聚集了侦探、老管家与女仆三人。',
  });

  // 4. 创建房间并注册成员
  const room = new MultiAgentRoom({
    roomId: 'mansion-murder',
    orchestrator: directorOrchestrator,
    agents: [detective, butler, maid],
    toolRegistry,
  });

  // 监听公聊与私聊广播
  room.eventBus.onAnyMessage((msg) => {
    const scopeTag = msg.visibility === 'PUBLIC' ? '[公聊]' : `[私聊 -> ${msg.visibleTo?.join(',')}]`;
    console.log(`\n\x1b[36m${scopeTag} <${msg.senderName}>\x1b[0m: ${msg.content}`);
    if (msg.innerThought) {
      console.log(`\x1b[33m  (心声/内心独白: ${msg.innerThought})\x1b[0m`);
    }
  });

  // 监听工具调用
  room.eventBus.onLifecycle('*', (ev) => {
    if (ev.type === 'agent:tool_call') {
      console.log(`\x1b[35m  ⚡ [角色行动技能触发] ${ev.payload.toolName} ->\x1b[0m`, ev.payload.arguments);
    } else if (ev.type === 'agent:tool_result') {
      console.log(`\x1b[32m  ✓ [搜查物证产出] ${ev.payload.result}\x1b[0m`);
    }
  });

  // 5. 启动剧情开场白并自动演练 4 轮
  await room.run(
    '【主持人开场】：各位，伯爵今晨被发现倒在书房，死于刀伤。门窗由内反锁，凶手就在你们之中。夏洛克先生，请开始你的询问。',
    4
  );

  console.log('\n========================================================');
  console.log('   剧本杀第一幕演绎完成');
  console.log('========================================================\n');
}

runMurderMystery().catch(console.error);
