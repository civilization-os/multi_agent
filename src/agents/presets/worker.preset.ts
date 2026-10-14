import type { BaseChatModel } from '@civilization/model-core';
import { RoleAgent } from '../role.agent.js';

export interface WorkerPresetConfig {
  id: string;
  name?: string;
  role: string;
  model: BaseChatModel;
  tools?: string[];
  persona?: string;
}

export function createWorkerAgent(config: WorkerPresetConfig): RoleAgent {
  const persona =
    config.persona ??
    `你是一位专注于【${config.role}】领域的专业执行智能体。
你的职责是高效执行交托给你的具体子任务，并在需要时合理使用工具，给出高质量的产出。`;

  return new RoleAgent({
    id: config.id,
    name: config.name ?? config.id,
    persona,
    model: config.model,
    tools: config.tools,
  });
}
