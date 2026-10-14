import type { BaseChatModel } from '@civilization/model-core';
import { RoleAgent } from '../role.agent.js';

export interface PlannerPresetConfig {
  id?: string;
  name?: string;
  model: BaseChatModel;
}

export function createPlannerAgent(config: PlannerPresetConfig): RoleAgent {
  const persona = `你是一位高阶系统架构与任务分解专家。
你的任务是根据用户的需求，将其合理拆分为有序且高效的子任务步骤。
请输出结构化任务清单，指明每个子任务的执行角色与目标。`;

  return new RoleAgent({
    id: config.id ?? 'planner',
    name: config.name ?? '规划专家',
    persona,
    model: config.model,
    tools: [],
  });
}
