import type { IOrchestrator, NextSpeakerDecision } from '../base-orchestrator.js';
import type { MultiAgentRoom } from '../session-room.js';

export interface PipelineOptions {
  plannerId: string;
  workerIds: string[];
  reviewerId?: string;
  maxReviewLoops?: number;
}

/**
 * 策略 C：SOP 任务流水线编排策略 (PipelineOrchestrator)
 * 严格按照 Planner -> 依次驱动各 Worker -> Reviewer 审查闭环
 */
export class PipelineOrchestrator implements IOrchestrator {
  public readonly name = 'Pipeline';
  private plannerId: string;
  private workerIds: string[];
  private reviewerId?: string;
  private maxReviewLoops: number;

  private executedWorkers = new Set<string>();
  private plannerExecuted = false;
  private currentLoop = 0;

  constructor(options: PipelineOptions) {
    this.plannerId = options.plannerId;
    this.workerIds = [...options.workerIds];
    this.reviewerId = options.reviewerId;
    this.maxReviewLoops = options.maxReviewLoops ?? 2;
  }

  public async selectNextSpeaker(room: MultiAgentRoom): Promise<NextSpeakerDecision> {
    // 阶段 1：Planner 规划阶段
    if (!this.plannerExecuted) {
      this.plannerExecuted = true;
      return {
        nextSpeakerId: this.plannerId,
        stageHint: '请作为规划者，分析用户目标并拆解出结构化执行步骤。',
      };
    }

    // 阶段 2：Worker 顺序执行阶段
    for (const workerId of this.workerIds) {
      if (!this.executedWorkers.has(workerId)) {
        this.executedWorkers.add(workerId);
        return {
          nextSpeakerId: workerId,
          stageHint: '请参考前面规划者与已完成的产物，执行你职责范围内的具体工作。',
        };
      }
    }

    // 阶段 3：Reviewer 审查阶段
    if (this.reviewerId) {
      // 检查最近一条发言是否已经是 Reviewer 发言
      const history = room.roomMemory.getAllHistory();
      const lastMsg = history[history.length - 1];

      if (lastMsg?.senderId === this.reviewerId) {
        // 审查完成
        const approved =
          !lastMsg.content.includes('不合格') &&
          !lastMsg.content.includes('打回') &&
          !lastMsg.content.includes('"approved": false');

        if (approved || this.currentLoop >= this.maxReviewLoops) {
          return { shouldTerminate: true };
        }

        // 打回重试一轮 Worker
        this.currentLoop++;
        this.executedWorkers.clear();
        return {
          nextSpeakerId: this.workerIds[0],
          stageHint: `审查未通过，请根据以下评语进行修订：\n${lastMsg.content}`,
        };
      }

      return {
        nextSpeakerId: this.reviewerId,
        stageHint: '请对全场各 Worker 的产出成果进行综合质量验收。',
      };
    }

    // 全部执行完毕
    return { shouldTerminate: true };
  }
}
