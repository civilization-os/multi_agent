/**
 * 示例 3：软件研发流水线 (Dev Pipeline)
 * 演示：使用 presets 生产力预设 + PipelineOrchestrator 流水线策略
 */

import { createChatModel } from '@civilization/model-core';
import {
  MultiAgentRoom,
  createPlannerAgent,
  createWorkerAgent,
  createReviewerAgent,
  PipelineOrchestrator,
} from '../src/index.js';

async function runDevPipeline() {
  console.log('========================================================');
  console.log('   ⚙️ 软件研发 SOP 流水线协同演示');
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

  // 使用生产力预设工厂创建三大角色
  const planner = createPlannerAgent({
    id: 'planner',
    name: '架构规划者',
    model: sharedModel,
  });

  const worker = createWorkerAgent({
    id: 'coder',
    name: '全栈工程师',
    role: '全栈工程师',
    model: sharedModel,
  });

  const reviewer = createReviewerAgent({
    id: 'reviewer',
    name: '代码审查总监',
    model: sharedModel,
  });

  const pipeline = new PipelineOrchestrator({
    plannerId: 'planner',
    workerIds: ['coder'],
    reviewerId: 'reviewer',
    maxReviewLoops: 2,
  });

  const room = new MultiAgentRoom({
    roomId: 'dev-team-01',
    orchestrator: pipeline,
    agents: [planner, worker, reviewer],
  });

  room.eventBus.onAnyMessage((msg) => {
    console.log(`\n\x1b[32m【${msg.senderName} 汇报】\x1b[0m\n${msg.content}`);
  });

  // 启动流水线研发任务
  await room.run('请用 TypeScript 设计一个高并发安全的带 TTL 自动过期的本地内存缓存类。', 3);
}

runDevPipeline().catch(console.error);
