# Phase 4 実装ガイド — オーケストレーターエージェントによるTodo自動分解・登録

> **目標**: チャットに「やりたいこと」を自然言語で入力すると、オーケストレーターエージェントが
> サブエージェント（思考エージェント）に「Todoの分解」を委譲し、その結果を受け取って
> Rails API に登録する。
> **前提**: Phase 3 (Mastra 導入・todoAgent 実装) が完了していること。

---

## 0. アーキテクチャ概要

```
チャット UI
  │ 「来週の旅行準備をしたい」
  ▼
todoOrchestratorAgent（オーケストレーター）
  │ agents: { todoDecomposerAgent } を持つ
  │ → Mastra が自動で "agent-todoDecomposer" ツールに変換
  │
  ├─ [委譲] agent-todoDecomposer を呼び出す
  │       ↓
  │   todoDecomposerAgent（サブエージェント）
  │   「来週の旅行準備」を具体的なTodoに分解して返す
  │       ↓
  │   ["ホテルの予約確認", "交通機関のチケット購入", ...]
  │
  └─ [実行] createTodo ツールで各Todoを順番に登録
        ↓
      Rails API  POST /api/v1/todos
```

---

## 1. Mastra のサブエージェント仕組み

Mastra では `Agent` の設定に `agents` プロパティを渡すと、
**各サブエージェントが自動的にツールとして変換**される。

```typescript
const orchestrator = new Agent({
  agents: {
    todoDecomposer: todoDecomposerAgent,
    // → ツール名: "agent-todoDecomposer" として自動登録
  },
});
```

### ツール名の命名規則

| 設定キー | 自動生成されるツール名 |
|---|---|
| `agents: { todoDecomposer: ... }` | `agent-todoDecomposer` |
| `agents: { researcher: ... }` | `agent-researcher` |
| `workflows: { research: ... }` | `workflow-research` |

オーケストレーターは LLM がこの自動生成ツールを呼ぶことでサブエージェントに委譲する。
`description` を明確に書くことでいつ委譲するかを LLM が判断できる。

---

## 2. ファイル構成（変更後）

```
frontend/src/mastra/
├── agents/
│   ├── todo-agent.ts                    # 既存（変更なし）
│   ├── todo-decomposer-agent.ts         # 新規: 思考エージェント
│   ├── todo-orchestrator-agent.ts       # 新規: オーケストレーター
│   ├── receipt-analyzer-agent.ts
│   └── weather-agent.ts
├── tools/
│   └── todo-tool.ts                     # 既存（変更なし）
└── index.ts                             # agents に2つ追加
```

---

## 3. 実装

### 3-1. todoDecomposerAgent（思考エージェント）

`frontend/src/mastra/agents/todo-decomposer-agent.ts` を新規作成:

```typescript
import { Agent } from "@mastra/core/agent";

export const todoDecomposerAgent = new Agent({
  id: "todo-decomposer-agent",
  name: "Todo Decomposer Agent",
  description:
    "ユーザーのやりたいこと・目標を受け取り、具体的で実行可能なTodoリストに分解する。" +
    "各Todoにタイトル・説明・優先度・期限の推奨値を付けてJSON配列で返す。",
  instructions: `
あなたはタスク分解の専門家です。
ユーザーが入力した「やりたいこと」や「目標」を、具体的で実行可能なTodoに分解してください。

【分解のルール】
1. 1つのTodoは「30分〜2時間で完了できる」粒度にする
2. 依存関係がある場合は実行順序を考慮する
3. 抽象的な表現は具体的な行動に変換する（「準備する」→「〇〇を購入する」など）
4. Todoは3〜7個程度に収める（多すぎず少なすぎず）

【出力形式】
必ず以下のJSON配列で返してください:

\`\`\`json
[
  {
    "title": "Todoのタイトル（短く具体的に）",
    "description": "詳細説明（何をどうするか）",
    "priority": "high | medium | low",
    "due_date": "YYYY-MM-DD または null"
  }
]
\`\`\`

due_date は「来週」「明日」などの相対表現を絶対日付に変換してください。
今日の日付を基準に計算してください。
  `,
  model: "google/gemini-2.5-flash",
  tools: {},
});
```

### 3-2. todoOrchestratorAgent（オーケストレーター）

`frontend/src/mastra/agents/todo-orchestrator-agent.ts` を新規作成:

```typescript
import { Agent } from "@mastra/core/agent";
import { createTodo } from "../tools/todo-tool";
import { todoDecomposerAgent } from "./todo-decomposer-agent";

export const todoOrchestratorAgent = new Agent({
  id: "todo-orchestrator-agent",
  name: "Todo Orchestrator Agent",
  instructions: `
あなたはTodo管理のオーケストレーターです。
ユーザーの「やりたいこと」を受け取り、以下の手順で処理してください。

【処理手順】
1. agent-todoDecomposer を呼び出し、やりたいことを具体的なTodoリストに分解してもらう
2. 返ってきたJSON配列を解析する
3. 各Todoを createTodo ツールで Rails API に登録する
4. 全件登録完了後、登録したTodo一覧を日本語で報告する

【報告形式】
「以下の X 件のTodoを登録しました：
1. [タイトル]（優先度: 高/中/低）
2. ...」

【注意事項】
- Todoの登録は必ず1件ずつ順番に行うこと
- 分解エージェントからJSONが返らない場合は再度依頼すること
- 登録失敗したTodoがあれば、その旨を報告すること
  `,
  model: "google/gemini-2.5-flash",

  // サブエージェントを登録 → "agent-todoDecomposer" ツールとして自動変換される
  agents: {
    todoDecomposer: todoDecomposerAgent,
  },

  // Rails API への登録ツール
  tools: { createTodo },
});
```

### 3-3. index.ts にエージェントを登録

`frontend/src/mastra/index.ts`:

```typescript
import { todoDecomposerAgent }    from "./agents/todo-decomposer-agent";
import { todoOrchestratorAgent }  from "./agents/todo-orchestrator-agent";

export const mastra = new Mastra({
  agents: {
    weatherAgent,
    todoAgent,
    receiptAnalyzerAgent,
    todoDecomposerAgent,       // 追加
    todoOrchestratorAgent,     // 追加
  },
  // ... 既存の設定
});
```

---

## 4. フロントエンドからの呼び出し

既存の `AgentChat` コンポーネントで `agentId` を切り替えるだけで動作する。

```typescript
// チャットUIからの呼び出しイメージ
const result = await mastra
  .getAgent("todo-orchestrator-agent")
  .generate([
    { role: "user", content: "来週の旅行準備をしたい" },
  ]);

// result.text に登録完了メッセージが返る
// result.toolCalls に agent-todoDecomposer と createTodo の呼び出し履歴
```

---

## 5. 処理フローの詳細

```
ユーザー: 「来週の旅行準備をしたい」
      │
      ▼
[todoOrchestratorAgent]
  LLM が判断: "まず分解エージェントに委譲しよう"
      │
      ▼ ToolCall: agent-todoDecomposer
[todoDecomposerAgent]
  LLM が分解:
  [
    { title: "ホテルの予約確認",      priority: "high",   due_date: "2026-04-28" },
    { title: "新幹線チケットの購入",   priority: "high",   due_date: "2026-04-27" },
    { title: "旅行用バッグの準備",    priority: "medium", due_date: "2026-04-29" },
    { title: "観光スポットのリサーチ", priority: "low",    due_date: null        },
  ]
      │ JSON を返す
      ▼
[todoOrchestratorAgent]
  LLM が判断: "4件登録しよう"
      │
      ├─ ToolCall: createTodo({ title: "ホテルの予約確認", ... })
      ├─ ToolCall: createTodo({ title: "新幹線チケットの購入", ... })
      ├─ ToolCall: createTodo({ title: "旅行用バッグの準備", ... })
      └─ ToolCall: createTodo({ title: "観光スポットのリサーチ", ... })
      │
      ▼
「以下の4件のTodoを登録しました：
1. ホテルの予約確認（優先度: 高）
2. 新幹線チケットの購入（優先度: 高）
...」
```

---

## 6. メリット・デメリット

| 観点 | 内容 |
|---|---|
| **メリット** | 分解ロジックをサブエージェントに分離できるため、分解品質を独立して改善できる |
| **メリット** | `agents: { key: agent }` の設定だけでサブエージェント化できる（Mastra ネイティブな書き方） |
| **メリット** | オーケストレーターのinstructionsを変えるだけで委譲タイミングを制御できる |
| **メリット** | 将来的に「見積もりエージェント」「優先度判断エージェント」を追加しやすい |
| **デメリット** | LLM を2回呼ぶためコスト・レイテンシが増える（分解1回 + 登録N回） |
| **デメリット** | サブエージェントのJSON出力がパースできない場合のリトライは LLM 任せ |
| **デメリット** | デバッグ時にどのエージェントで失敗したか追いにくい（Mastra Studio で確認要） |

---

## 7. 拡張パターン

### 優先度判断エージェントを追加する場合

```typescript
// 分解 → 優先度付け → 登録 の3段構成
agents: {
  todoDecomposer:    todoDecomposerAgent,    // "agent-todoDecomposer"
  priorityEstimator: priorityEstimatorAgent, // "agent-priorityEstimator"
},
```

オーケストレーターのinstructionsに「分解後、優先度判断エージェントに渡してから登録すること」と書くだけで連携できる。

### 既存 todoAgent との使い分け

| エージェント | 用途 |
|---|---|
| `todoAgent` | 「タスクAを完了にして」などの直接操作 |
| `todoOrchestratorAgent` | 「〇〇したい」などの目標から自動分解・一括登録 |

チャットUIで入力内容に応じてどちらのエージェントに渡すか切り替えるか、
1つのエージェントにまとめてルーティングさせることも可能。

---

## 8. チェックリスト

- [ ] `frontend/src/mastra/agents/todo-decomposer-agent.ts` を作成
- [ ] `frontend/src/mastra/agents/todo-orchestrator-agent.ts` を作成
- [ ] `frontend/src/mastra/index.ts` に2エージェントを追加
- [ ] Mastra Studio (`npx mastra dev`) でエージェント一覧に表示されることを確認
- [ ] チャットから「〇〇したい」と入力して `agent-todoDecomposer` ToolCall が発生することを確認
- [ ] 登録されたTodoが Rails API 経由でDBに保存されていることを確認
- [ ] フロントのTodoリストに新規Todoが反映されることを確認（`onAction` コールバック）

---

## 参考ドキュメント

- [Supervisor agents | Mastra Docs](https://mastra.ai/docs/agents/supervisor-agents)
- [Agent networks | Mastra Docs](https://mastra.ai/docs/agents/networks)
- [Example: Supervisor Agent | Mastra Docs](https://mastra.ai/examples/agents/supervisor-agent)
- [Multi-agent systems | Mastra Docs](https://mastra.ai/guides/concepts/multi-agent-systems)
