# @civilization/multi-agent (Universal Base Edition)

`@civilization/multi-agent` 是通用多智能体底座引擎（Node.js + TypeScript），直接依托底层 `@civilization/model-core`。

[![CI](https://github.com/civilization-os/multi_agent/actions/workflows/ci.yml/badge.svg)](https://github.com/civilization-os/multi_agent/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@civilization/multi-agent.svg)](https://www.npmjs.com/package/@civilization/multi-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

本引擎采用**场景无关（Scenario-Agnostic）的通用内核设计**，既能支撑开放式社交与非对称信息博弈（如**剧本杀/狼人杀、多模型聊天室、圆桌辩论、TRPG 跑团**），也能无缝支撑结构化研发生产力（如**代码生成流水线、任务自动分解与审查**）。

---

## 核心设计哲学

1. **通用角色智能体 (`Persona / Role Agent`)**：
   - 彻底打破传统多 Agent 框架死板的职能划分。
   - 任何智能体均由 `Persona（人设与目标） + Model（异构底层大模型） + Tools（技能/游戏动作包） + PrivateMemory（私密记忆与底牌）` 自由组装。

2. **第一人称视角渲染与视野隔离 (`Perspective & Visibility Isolation`)**：
   - **第一人称视角投射 (`PerspectiveRenderer`)**：将多人群聊流水编译给底层模型时，智能体自身的历史发言自动映射为 `assistant`（无前缀纯正文），其他人的发言映射为带名字标签的 `user`（如 `[老管家]: 我不知道`），彻底根除多 Agent 群聊中的身份混淆；同时自动安全合并连续的同角色消息，保证各模型厂商的交替契约。
   - **严密视野隔离**：支持**全员公聊（`PUBLIC`）**、**指定多方私聊/阵营频道（`WHISPER`）**与**系统密令（`PRIVATE_SYSTEM`）**。其他智能体**绝对无法窥视他人的内心独白（`innerThought`）与未授权私聊**，天然支持非对称博弈。

3. **可插拔发言调度器 (`Pluggable Turn Orchestrator`)**：
   - 将“谁在什么时候跟谁说话”抽象为可热插拔的策略接口 `IOrchestrator`。
   - 内置三大标准策略：
     - **自由群聊 (`GroupChatOrchestrator`)**：支持 `@提及点名优先接话`、自动轮流接龙与防自问自答。
     - **导演/DM 控场 (`DirectorOrchestrator`)**：引入裁判/导演模型动态裁决下一棒发言人并注入临时剧情引导词。
     - **任务流水线 (`PipelineOrchestrator`)**：驱动标准的 `Planner -> Worker -> Reviewer` 闭环。

4. **严格职责边界**：
   - 100% 从 `@civilization/model-core` 导入统一消息与模型基类，本模块严禁直接引入任何大模型原厂 SDK，轻量纯粹。

---

## 工程目录结构

```text
multi_agent/
├── package.json
├── tsconfig.json
├── README.md                           # 中文技术规格与使用文档
├── src/
│   ├── index.ts                        # 统一对外导出出口
│   ├── agents/                         # 【模块 1】通用智能体基类与预设角色模板
│   │   ├── index.ts
│   │   ├── base-agent.ts               # BaseAgent 抽象基类 (内置 ReAct 工具自循环与前缀清洗)
│   │   ├── role.agent.ts               # RoleAgent 通用角色类 (人设、底牌、私密记忆与沉浸发声)
│   │   └── presets/                    # 生产力预设模板 (全部继承自 RoleAgent)
│   │       ├── planner.preset.ts       # 预设：任务规划者
│   │       ├── worker.preset.ts        # 预设：任务执行者
│   │       └── reviewer.preset.ts      # 预设：质量审查者
│   ├── communication/                  # 【模块 2】视野感知通信协议、事件总线与路由
│   │   ├── index.ts
│   │   ├── protocol.ts                 # RoomMessage 信封协议 (含公聊/私聊可见性)
│   │   ├── event-bus.ts                # 异步事件总线 (支持可见性过滤与生命周期遥测)
│   │   └── router.ts                   # 消息路由器 (处理 @Mention 提取与可见性校验)
│   ├── memory/                         # 【模块 3】支持视角转换与视野隔离的记忆系统
│   │   ├── index.ts
│   │   ├── perspective.ts              # 【核心】第一人称视角渲染器与连续消息合并
│   │   ├── room-memory.ts              # 房间级消息历史 (按可见性过滤、隔离内心独白)
│   │   ├── agent-memory.ts             # 智能体私有记忆 (存放专属秘密底牌、内心独白)
│   │   └── blackboard.ts               # 共享黑板 (存放公共线索池、会话阶段与共享产物)
│   ├── tools/                          # 【模块 4】工具定义与技能中心
│   │   ├── index.ts
│   │   ├── define-tool.ts              # 基于 Zod 的类型安全工具定义器 (自动生成 UnifiedTool)
│   │   └── registry.ts                 # ToolRegistry 工具注册表与执行沙箱
│   └── orchestrator/                   # 【模块 5】通用房间容器与三大可插拔编排引擎
│       ├── index.ts
│       ├── session-room.ts             # MultiAgentRoom 通用房间容器 (管理成员、记忆、黑板与单步步进)
│       ├── base-orchestrator.ts        # IOrchestrator 编排器策略抽象接口
│       └── strategies/                 # 三大内置编排策略
│           ├── group-chat.strategy.ts  # 策略 A：自由群聊 (支持轮流发言、@点名优先响应)
│           ├── director.strategy.ts    # 策略 B：导演/DM 控场模式 (剧本杀、法庭辩论、跑团)
│           └── pipeline.strategy.ts    # 策略 C：SOP 任务流水线 (Planner -> Worker -> Reviewer)
├── examples/
│   ├── murder-mystery-room.ts          # 示例 1：剧本杀/审讯室 (私密底牌、搜证技能、导演控场)
│   ├── free-chat-room.ts               # 示例 2：开放式社交群聊 (多模型讨论、@点名互动)
│   └── dev-pipeline.ts                 # 示例 3：软件开发流水线 (生产力预设 + SOP 模式)
└── tests/
    ├── perspective.test.ts             # 视角转换与私密视野隔离单元测试
    ├── tools.test.ts                   # 工具定义与沙箱校验测试
    ├── communication.test.ts           # 视野通信与事件总线测试
    └── orchestrator.test.ts            # 房间推进与编排调度策略测试
```

---

## 快速上手与多场景示例

### 1. 安装与构建

```bash
cd d:\project\aibase\multi_agent
npm install
npm run build
npm test
```

---

### 2. 场景 A：剧本杀 / 非对称博弈（带秘密底牌与导演控场）

```typescript
import { z } from 'zod';
import { createChatModel } from '@civilization/model-core';
import {
  MultiAgentRoom,
  RoleAgent,
  DirectorOrchestrator,
  ToolRegistry,
  defineTool,
} from '@civilization/multi-agent';

const model = createChatModel({
  category: 'protocol',
  protocol: 'openai-compatible',
  modelName: 'deepseek-chat',
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY!,
});

// 1. 注册行动技能（角色可自主触发的游戏动作）
const registry = new ToolRegistry();
registry.register(
  defineTool({
    name: 'search_clues',
    description: '搜查案发现场获取物证',
    parameters: z.object({ location: z.enum(['书房', '花园']) }),
    execute: async ({ location }) => ({ item: location === '花园' ? '染血短刀' : '撕毁遗嘱' }),
  })
);

// 2. 创建具备专属私密底牌的智能体
const detective = new RoleAgent({
  id: 'sherlock',
  name: '神探夏洛克',
  persona: '严谨的侦探，善于搜证并寻找证词漏洞。',
  model,
  tools: ['search_clues'],
});

const butler = new RoleAgent({
  id: 'butler',
  name: '老管家',
  persona: '表面恭顺，但内心恐慌。',
  secretContext: '【私密底牌】：你是真凶！昨晚用短刀刺杀了伯爵并埋在花园，绝不能承认！',
  model,
});

// 3. 构建导演控场房间
const room = new MultiAgentRoom({
  orchestrator: new DirectorOrchestrator({ directorModel: model }),
  agents: [detective, butler],
  toolRegistry: registry,
});

// 4. 推进剧情演绎
await room.run('伯爵昨夜遇害，大厅调查开始。', 4);
```

---

### 3. 场景 B：开放聊天室（@点名接龙与自由插话）

```typescript
import { MultiAgentRoom, RoleAgent, GroupChatOrchestrator } from '@civilization/multi-agent';

const room = new MultiAgentRoom({
  orchestrator: new GroupChatOrchestrator({ mode: 'round-robin' }),
  agents: [agentA, agentB],
});

// 人类在群聊中发言并 @角色
await room.broadcast('人类玩家', '你怎么看端侧小模型的发展前景？@智能体A');

// 自动推进讨论
await room.run(undefined, 3);
```

---

### 4. 场景 C：SOP 生产力流水线

```typescript
import {
  MultiAgentRoom,
  createPlannerAgent,
  createWorkerAgent,
  createReviewerAgent,
  PipelineOrchestrator,
} from '@civilization/multi-agent';

const room = new MultiAgentRoom({
  orchestrator: new PipelineOrchestrator({
    plannerId: 'planner',
    workerIds: ['worker'],
    reviewerId: 'reviewer',
  }),
  agents: [
    createPlannerAgent({ model }),
    createWorkerAgent({ id: 'worker', role: '全栈工程师', model }),
    createReviewerAgent({ model }),
  ],
});

await room.run('设计一个高并发安全的带 TTL 自动过期的本地缓存类。');
```
