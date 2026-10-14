import { z } from 'zod';
import type { UnifiedTool, UnifiedToolCall } from '@civilization/model-core';
import type { CustomTool, ToolExecutionContext } from './define-tool.js';

/**
 * 工具注册表与执行沙箱
 * 支持权限过滤、参数 Zod 校验与执行容错处理
 */
export class ToolRegistry {
  private tools = new Map<string, CustomTool<any, any>>();

  /**
   * 注册单个自定义工具
   */
  public register(tool: CustomTool<any, any>): this {
    this.tools.set(tool.name, tool);
    return this;
  }

  /**
   * 批量注册工具
   */
  public registerAll(tools: CustomTool<any, any>[]): this {
    for (const tool of tools) {
      this.register(tool);
    }
    return this;
  }

  /**
   * 根据名称获取工具实现
   */
  public getTool(name: string): CustomTool<any, any> | undefined {
    return this.tools.get(name);
  }

  /**
   * 获取工具对应的 UnifiedTool 列表
   * @param names 若指定，则仅返回白名单内的工具；未指定则返回全部注册工具
   */
  public getTools(names?: string[]): UnifiedTool[] {
    if (!names) {
      return Array.from(this.tools.values()).map((t) => t.asUnifiedTool());
    }

    const result: UnifiedTool[] = [];
    for (const name of names) {
      const tool = this.tools.get(name);
      if (tool) {
        result.push(tool.asUnifiedTool());
      }
    }
    return result;
  }

  /**
   * 安全执行单次工具调用
   * 包含：
   * 1. 工具存在性检查
   * 2. Zod 参数运行时校验
   * 3. 沙箱执行与异常捕获（转换为友好字符串反馈给模型，防止 Agent 崩溃）
   */
  public async executeToolCall(
    toolCall: UnifiedToolCall,
    context?: ToolExecutionContext
  ): Promise<string> {
    const tool = this.tools.get(toolCall.name);
    if (!tool) {
      return `Error: Tool '${toolCall.name}' is not registered or allowed.`;
    }

    // 运行时 Zod 参数校验
    const parseResult = tool.parameters.safeParse(toolCall.arguments);
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i: z.ZodIssue) => `Field '${i.path.join('.')}': ${i.message}`)
        .join('; ');
      return `Validation Error for tool '${toolCall.name}': ${issues}. Please correct your arguments and retry.`;
    }

    try {
      const output = await tool.execute(parseResult.data, context);
      if (output === undefined || output === null) {
        return 'Tool executed successfully (no return value).';
      }
      if (typeof output === 'string') {
        return output;
      }
      return JSON.stringify(output);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `Tool '${toolCall.name}' execution failed: ${message}. You may self-correct arguments or seek alternatives.`;
    }
  }
}
