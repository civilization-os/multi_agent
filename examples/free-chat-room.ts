/**
 * 示例 2：开放式社交群聊室 (Free Chat Room)
 * 演示：多智能体开放群聊、@提及点名优先接龙、自然轮流发言
 */

import { createChatModel } from '@civilization/model-core';
import {
  MultiAgentRoom,
  RoleAgent,
  GroupChatOrchestrator,
} from '../src/index.js';

async function runFreeChat() {
  console.log('========================================================');
  console.log('   💬 科技前沿开放群聊室演示');
  console.log('========================================================\n');

  const apiKey = process.env.DEEPSEEK_API_KEY || 'sk-ec0c9302b0a64e59b6f94232b3f3ffa3';
  const baseURL = 'https://api.deepseek.com';

  const chatModel = createChatModel({
    category: 'protocol',
    protocol: 'openai-compatible',
    modelName: 'deepseek-chat',
    baseURL,
    apiKey,
  });

  const techGuru = new RoleAgent({
    id: 'tech_guru',
    name: '极客阿杰',
    persona: '你是一位资深开源架构师与 AI 极客，热衷讨论底层编译器、GPU 算力与开源模型生态，说话生动风趣，喜欢 @其他人 征求意见。',
    model: chatModel,
  });

  const productLead = new RoleAgent({
    id: 'product_lead',
    name: '产品苏菲',
    persona: '你是一位敏锐的 AI 原生应用产品总监，关注用户体验、商业化落地与真实痛点，善于把技术转化为产品形态。',
    model: chatModel,
  });

  const room = new MultiAgentRoom({
    roomId: 'tech-salon',
    orchestrator: new GroupChatOrchestrator({ mode: 'round-robin' }),
    agents: [techGuru, productLead],
  });

  room.eventBus.onAnyMessage((msg) => {
    console.log(`\n\x1b[36m[${msg.senderName}]\x1b[0m: ${msg.content}`);
  });

  // 人类进入聊天室抛出话题并 @阿杰
  await room.broadcast('人类玩家', '大家怎么看最近端侧小模型（如 1B-3B 参数）在移动设备上的普及趋势？@极客阿杰');

  // 自动推进两轮多方讨论
  await room.run(undefined, 3);
}

runFreeChat().catch(console.error);
