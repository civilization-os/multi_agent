import type { BaseChatModel, UnifiedMessage, UnifiedToolCall } from '@civilization/model-core';
import type { ToolRegistry } from '../tools/registry.js';
import type { EventBus } from '../communication/event-bus.js';

export interface BaseAgentConfig {
  id: string;
  name: string;
  model: BaseChatModel;
  allowedTools?: string[];
  maxIterations?: number;
}

export interface AgentExecutionOptions {
  tools?: ToolRegistry;
  eventBus?: EventBus;
  roomId?: string;
  signal?: AbortSignal;
}

/**
 * 智能体抽象基类 BaseAgent
 * 封装与底层 @civilization/model-core 的纯净交互、ReAct 工具循环与名称前缀清洗
 */
export abstract class BaseAgent {
  public readonly id: string;
  public readonly name: string;
  public readonly model: BaseChatModel;
  public readonly allowedTools: string[];
  public readonly maxIterations: number;

  constructor(config: BaseAgentConfig) {
    this.id = config.id;
    this.name = config.name;
    this.model = config.model;
    this.allowedTools = config.allowedTools ?? [];
    this.maxIterations = config.maxIterations ?? 8;
  }

  /**
   * 清洗大模型不小心吐出的自身角色名前缀
   * 例如将 "[老管家]: 我昨晚睡得很早" 或 "老管家: 我不知道" 自动净化为 "我昨晚睡得很早"
   */
  public cleanNamePrefix(rawText: string): string {
    if (!rawText) return '';
    let text = rawText.trim();

    // 匹配如 [名字]: 、【名字】: 、名字: 等常见幻觉前缀
    const escapedName = this.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedId = this.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      `^(?:\\[${escapedName}\\]|[【]${escapedName}[】]|${escapedName}|\\[${escapedId}\\]|${escapedId})\\s*[:：]\\s*`,
      'i'
    );

    text = text.replace(regex, '').trim();
    return text;
  }

  /**
   * 核心 ReAct 工具自循环执行逻辑
   */
  protected async executeReActLoop(
    messages: UnifiedMessage[],
    options: AgentExecutionOptions = {}
  ): Promise<{ content: string; innerThought?: string }> {
    const currentMessages = [...messages];
    let iterations = 0;
    let finalContent = '';
    let reasoningAcc = '';

    while (iterations < this.maxIterations) {
      iterations++;

      const activeTools = options.tools
        ? options.tools.getTools(this.allowedTools.length > 0 ? this.allowedTools : undefined)
        : undefined;

      options.eventBus?.emitLifecycle({
        type: 'agent:thinking',
        roomId: options.roomId ?? 'default',
        agentId: this.id,
        payload: { iteration: iterations },
        timestamp: Date.now(),
      });

      const response = await this.model.invoke(currentMessages, {
        tools: activeTools,
        signal: options.signal,
      });

      if (response.reasoning) {
        reasoningAcc = reasoningAcc ? `${reasoningAcc}\n${response.reasoning}` : response.reasoning;
      }

      // 遇到工具调用
      if (
        response.stopReason === 'tool_call' &&
        response.toolCalls &&
        response.toolCalls.length > 0
      ) {
        currentMessages.push({
          role: 'assistant',
          content: response.content || '',
          toolCalls: response.toolCalls,
        });

        for (const toolCall of response.toolCalls) {
          options.eventBus?.emitLifecycle({
            type: 'agent:tool_call',
            roomId: options.roomId ?? 'default',
            agentId: this.id,
            payload: {
              toolName: toolCall.name,
              arguments: toolCall.arguments,
            },
            timestamp: Date.now(),
          });

          let toolResult = '';
          if (options.tools) {
            toolResult = await options.tools.executeToolCall(toolCall, {
              agentId: this.id,
              roomId: options.roomId,
            });
          } else {
            toolResult = `Error: ToolRegistry not provided for ${toolCall.name}`;
          }

          options.eventBus?.emitLifecycle({
            type: 'agent:tool_result',
            roomId: options.roomId ?? 'default',
            agentId: this.id,
            payload: {
              toolName: toolCall.name,
              result: toolResult,
            },
            timestamp: Date.now(),
          });

          currentMessages.push({
            role: 'tool',
            content: toolResult,
            toolCallId: toolCall.id,
          });
        }

        continue;
      }

      finalContent = response.content;
      break;
    }

    return {
      content: this.cleanNamePrefix(finalContent),
      innerThought: reasoningAcc || undefined,
    };
  }
}
