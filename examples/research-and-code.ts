/**
 * 端到端多智能体协同范例 (Research & Code Pipeline)
 * 演示：异构模型混编 + ToolRegistry 工具挂载 + 事件总线实时监视 + DAG 任务闭环
 */

import { z } from 'zod';
import { createChatModel } from '@civilization/model-core';
import {
  Orchestrator,
  PlannerAgent,
  WorkerAgent,
  ReviewerAgent,
  ToolRegistry,
  defineTool,
} from '../src/index.js';

async function main() {
  console.log('========================================================');
  console.log('   Multi-Agent 多智能体协同流水线运行演示');
  console.log('========================================================\n');

  // 1. 初始化模型：可使用官方旗舰或本地模型，若无 Key 则使用本地或模拟
  // 支持真实 API Key (如 DeepSeek, Gemini, OpenAI)
  const apiKey = process.env.DEEPSEEK_API_KEY || 'sk-ec0c9302b0a64e59b6f94232b3f3ffa3';
  const baseURL = 'https://api.deepseek.com';

  const plannerModel = createChatModel({
    category: 'protocol',
    protocol: 'openai-compatible',
    modelName: 'deepseek-chat',
    baseURL,
    apiKey,
  });

  const workerModel = createChatModel({
    category: 'protocol',
    protocol: 'openai-compatible',
    modelName: 'deepseek-chat',
    baseURL,
    apiKey,
  });

  const reviewerModel = createChatModel({
    category: 'protocol',
    protocol: 'openai-compatible',
    modelName: 'deepseek-chat',
    baseURL,
    apiKey,
  });

  // 2. 定义业务工具集并注册
  const toolRegistry = new ToolRegistry();

  // 工具 1：服务器状态探测
  toolRegistry.register(
    defineTool({
      name: 'fetch_server_metrics',
      description: '探测指定生产服务器的 CPU 与内存实时使用率',
      parameters: z.object({
        host: z.string().describe('服务器主机名或 IP 地址'),
      }),
      execute: async ({ host }) => {
        return {
          host,
          cpuUsage: '78.5%',
          memoryUsage: '89.2%',
          status: 'WARNING_HIGH_LOAD',
          timestamp: new Date().toISOString(),
        };
      },
    })
  );

  // 工具 2：扩容决策计算器
  toolRegistry.register(
    defineTool({
      name: 'calculate_scaling_plan',
      description: '根据当前负载计算推荐的扩容实例数量',
      parameters: z.object({
        currentCpu: z.number().describe('当前 CPU 百分比 (0-100)'),
        targetCpu: z.number().default(50).describe('期望压制的目标 CPU 百分比'),
      }),
      execute: async ({ currentCpu, targetCpu }) => {
        const factor = Math.ceil(currentCpu / targetCpu);
        return {
          recommendedAdditionalInstances: factor,
          estimatedTargetCpu: `${Math.round(currentCpu / factor)}%`,
        };
      },
    })
  );

  // 3. 组装多智能体角色
  const planner = new PlannerAgent({
    id: 'lead-planner',
    name: '首席系统架构师',
    model: plannerModel,
  });

  const opsWorker = new WorkerAgent({
    id: 'ops-worker',
    name: '运维监控专员',
    role: '运维专员',
    model: workerModel,
    tools: ['fetch_server_metrics', 'calculate_scaling_plan'],
  });

  const reviewer = new ReviewerAgent({
    id: 'senior-reviewer',
    name: '运维审计总监',
    model: reviewerModel,
  });

  // 4. 组装编排引擎
  const orchestrator = new Orchestrator({
    planner,
    workers: [opsWorker],
    reviewer,
    toolRegistry,
    maxReviewLoops: 2,
  });

  // 5. 监听生命周期与协同事件
  orchestrator.on('lifecycle', (ev) => {
    if (ev.type === 'task:started') {
      console.log(`\x1b[34m[任务启动]\x1b[0m 目标: ${ev.payload.goal}`);
    } else if (ev.type === 'agent:thinking') {
      console.log(`\x1b[33m[Agent思考中]\x1b[0m ${ev.agentId} (轮次: ${ev.payload.iteration})`);
    } else if (ev.type === 'agent:tool_call') {
      console.log(`\x1b[36m[工具调用]\x1b[0m ${ev.payload.toolName} -> 参数:`, ev.payload.arguments);
    } else if (ev.type === 'agent:tool_result') {
      console.log(`\x1b[32m[工具返回]\x1b[0m ${ev.payload.toolName}`);
    } else if (ev.type === 'task:subtask_done') {
      console.log(`\x1b[35m[子任务完成]\x1b[0m ${ev.payload.taskId}`);
    } else if (ev.type === 'review:completed') {
      console.log(`\x1b[32m[审查报告]\x1b[0m 得分: ${ev.payload.score}, 通过: ${ev.payload.approved}`);
    }
  });

  // 6. 执行端到端编排
  console.log('\n--- 开始执行编排任务 ---\n');
  const goal = '对核心节点 192.168.1.100 进行负载指标巡检，并在过载时计算建议的扩容配额方案';
  const result = await orchestrator.run(goal);

  console.log('\n========================================================');
  console.log('   最终编排交付产物');
  console.log('========================================================\n');
  console.log('【全局追踪 ID】:', result.traceId);
  console.log('【审查结论】:', result.approved ? '通过' : '未通过', `(${result.score}分)`);
  console.log('【审查评语】:', result.reviewFeedback);
  console.log('\n【各子任务产出汇报】:\n', result.finalOutput);
}

main().catch(console.error);
