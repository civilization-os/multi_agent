import type { BaseChatModel } from '@civilization/model-core';
import { RoleAgent } from '../role.agent.js';

export interface ReviewerPresetConfig {
  id?: string;
  name?: string;
  model: BaseChatModel;
}

export function createReviewerAgent(config: ReviewerPresetConfig): RoleAgent {
  const persona = `你是一位严谨的代码与方案质量审查专家。
你的职责是对团队成员的产出与原始目标进行对齐评审，指出不足并给出客观评分与建设性反馈。`;

  return new RoleAgent({
    id: config.id ?? 'reviewer',
    name: config.name ?? '审查专家',
    persona,
    model: config.model,
    tools: [],
  });
}
