import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { UnifiedTool } from '@civilization/model-core';

export interface ToolExecutionContext {
  agentId?: string;
  traceId?: string;
  [key: string]: unknown;
}

export interface ToolDefinition<TSchema extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>, TOutput = unknown> {
  name: string;
  description: string;
  parameters: TSchema;
  execute: (args: z.infer<TSchema>, context?: ToolExecutionContext) => Promise<TOutput> | TOutput;
}

export interface CustomTool<TSchema extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>, TOutput = unknown> {
  name: string;
  description: string;
  parameters: TSchema;
  execute: (args: z.infer<TSchema>, context?: ToolExecutionContext) => Promise<TOutput> | TOutput;
  asUnifiedTool(): UnifiedTool;
}

/**
 * 类型安全的工具定义辅助函数
 * 自动将 TypeScript + Zod 定义转为底层 model_core 统一消费的 UnifiedTool
 */
export function defineTool<TSchema extends z.ZodObject<z.ZodRawShape>, TOutput>(
  definition: ToolDefinition<TSchema, TOutput>
): CustomTool<TSchema, TOutput> {
  // 生成标准 JSON Schema 并清洗多余的元信息
  const rawJsonSchema = zodToJsonSchema(definition.parameters, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  }) as Record<string, unknown>;

  // 去除顶层 $schema 避免部分模型解析器产生严格模式告警
  const { $schema, ...parametersSchema } = rawJsonSchema;

  const unifiedTool: UnifiedTool = {
    name: definition.name,
    description: definition.description,
    parameters: parametersSchema,
  };

  return {
    ...definition,
    asUnifiedTool(): UnifiedTool {
      return unifiedTool;
    },
  };
}
