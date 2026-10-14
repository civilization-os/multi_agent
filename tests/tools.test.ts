import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineTool, ToolRegistry } from '../src/index.js';

describe('Tools Subsystem (defineTool & ToolRegistry)', () => {
  it('should define tool with Zod schema and export valid UnifiedTool JSON Schema', () => {
    const weatherTool = defineTool({
      name: 'get_weather',
      description: 'Get temperature for a city',
      parameters: z.object({
        city: z.string().describe('The name of the city'),
        unit: z.enum(['c', 'f']).default('c'),
      }),
      execute: async ({ city, unit }) => {
        return { city, temperature: 25, unit };
      },
    });

    const unified = weatherTool.asUnifiedTool();
    expect(unified.name).toBe('get_weather');
    expect(unified.description).toBe('Get temperature for a city');
    expect(unified.parameters.type).toBe('object');
    expect((unified.parameters.properties as Record<string, unknown>).city).toBeDefined();
  });

  it('should register tools and filter by allowed list', () => {
    const registry = new ToolRegistry();
    const toolA = defineTool({
      name: 'tool_a',
      description: 'Tool A',
      parameters: z.object({ query: z.string() }),
      execute: () => 'A',
    });
    const toolB = defineTool({
      name: 'tool_b',
      description: 'Tool B',
      parameters: z.object({ count: z.number() }),
      execute: () => 'B',
    });

    registry.register(toolA).register(toolB);

    expect(registry.getTools()).toHaveLength(2);
    expect(registry.getTools(['tool_a'])).toHaveLength(1);
    expect(registry.getTools(['tool_a'])[0].name).toBe('tool_a');
    expect(registry.getTools(['non_existing'])).toHaveLength(0);
  });

  it('should execute tool call successfully and format JSON output', async () => {
    const registry = new ToolRegistry();
    registry.register(
      defineTool({
        name: 'add',
        description: 'Add two numbers',
        parameters: z.object({
          a: z.number(),
          b: z.number(),
        }),
        execute: ({ a, b }) => ({ sum: a + b }),
      })
    );

    const result = await registry.executeToolCall({
      id: 'call-1',
      name: 'add',
      arguments: { a: 10, b: 20 },
    });

    expect(JSON.parse(result)).toEqual({ sum: 30 });
  });

  it('should catch Zod validation errors and format friendly message for model self-correction', async () => {
    const registry = new ToolRegistry();
    registry.register(
      defineTool({
        name: 'search_user',
        description: 'Search user by id',
        parameters: z.object({
          userId: z.string().min(5, 'User ID must be at least 5 chars'),
        }),
        execute: ({ userId }) => `Found ${userId}`,
      })
    );

    const result = await registry.executeToolCall({
      id: 'call-2',
      name: 'search_user',
      arguments: { userId: '123' }, // 仅 3 字符，校验不通过
    });

    expect(result).toContain('Validation Error for tool');
    expect(result).toContain('User ID must be at least 5 chars');
  });

  it('should catch execution exceptions gracefully without crashing Agent', async () => {
    const registry = new ToolRegistry();
    registry.register(
      defineTool({
        name: 'risky_operation',
        description: 'May throw error',
        parameters: z.object({ flag: z.boolean() }),
        execute: () => {
          throw new Error('Database connection failed');
        },
      })
    );

    const result = await registry.executeToolCall({
      id: 'call-3',
      name: 'risky_operation',
      arguments: { flag: true },
    });

    expect(result).toContain("Tool 'risky_operation' execution failed: Database connection failed");
  });
});
