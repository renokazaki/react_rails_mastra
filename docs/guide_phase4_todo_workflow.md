# Phase 4 実装ガイド — Workflow で Todo を自動分解・登録する（パイプライン構成）

> **目標**: Mastra の Workflow を使い「分解 → 登録」を1つのパイプラインとして実装する。
> オーケストレーターエージェント方式（`guide_phase4_todo_orchestrator.md`）との比較も示す。
> **前提**: Phase 3 (Mastra 導入・todoAgent 実装) が完了していること。

---

## 0. オーケストレーター方式との違い

同じ「自然言語 → Todo 分解 → 登録」を実現するが、制御の主体が異なる。

| 観点 | オーケストレーター方式 | Workflow 方式（本ガイド） |
|---|---|---|
| 制御の主体 | LLM（エージェント）が判断して委譲 | コード（ステップ定義）が順序を決定 |
| 処理の順序保証 | LLM 次第（指示通りに動くとは限らない） | `.then()` で確定的に保証される |
| 型安全性 | ステップ間はテキスト受け渡し | `outputSchema` → `inputSchema` で型保証 |
| Mastra Studio | toolCall として表示 | ステップグラフとして可視化 |
| ステップ単位リトライ | 不可（エージェント全体を再実行） | 失敗したステップだけリトライ可能 |
| 実装の複雑さ | シンプル（エージェント2つ + instructions） | やや多い（Step × 3 + Workflow 定義） |

---

## 1. アーキテクチャ概要

```
チャット UI
  │ 「来週の旅行準備をしたい」
  ▼
todoWorkflow
  ├── Step 1: decomposeGoal      ← todoDecomposerAgent で目標 → Todo JSON配列
  │     │ outputSchema: TodoItem[]
  ▼     ▼
  ├── Step 2: registerTodos      ← createTodo ツールで全件 Rails API に登録
  │     │ outputSchema: RegisteredTodo[]
  ▼     ▼
  └── Step 3: summarize          ← 登録結果を日本語でまとめる
              ▼
        React UI に完了メッセージを返す
```

---

## 2. ファイル構成（変更後）

```
frontend/src/mastra/
├── agents/
│   ├── todo-decomposer-agent.ts        # 既存（変更なし）
│   └── ...
├── tools/
│   └── todo-tool.ts                    # 既存（変更なし）
├── workflows/
│   ├── weather-workflow.ts             # 既存
│   └── todo-workflow.ts               # 新規
└── index.ts                            # workflows に追加
```

---

## 3. 実装

### 3-1. スキーマ定義

各ステップの入出力をまとめて定義する。

```typescript
import { z } from "zod";

// Step 1 の出力 / Step 2 の入力
const todoItemSchema = z.object({
  title:       z.string(),
  description: z.string().optional(),
  priority:    z.enum(["high", "medium", "low"]),
  due_date:    z.string().nullable(),
});

// Step 2 の出力 / Step 3 の入力
const registeredTodoSchema = z.object({
  id:       z.number(),
  title:    z.string(),
  priority: z.string(),
});
```

### 3-2. todo-workflow.ts の作成

`frontend/src/mastra/workflows/todo-workflow.ts` を新規作成:

```typescript
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

const API_BASE = "http://localhost:3000/api/v1";

// --- スキーマ定義 ---

const todoItemSchema = z.object({
  title:       z.string(),
  description: z.string().optional(),
  priority:    z.enum(["high", "medium", "low"]),
  due_date:    z.string().nullable(),
});

const registeredTodoSchema = z.object({
  id:       z.number(),
  title:    z.string(),
  priority: z.string(),
});

// --- Step 1: 目標を Todo リストに分解する ---

const decomposeGoalStep = createStep({
  id: "decomposeGoal",
  description: "自然言語の目標を具体的な Todo リストに分解する",
  inputSchema: z.object({
    goal:  z.string().describe("ユーザーのやりたいこと・目標"),
    today: z.string().describe("今日の日付（YYYY-MM-DD）。due_date の基準として使用"),
  }),
  outputSchema: z.object({
    goal:  z.string(),
    todos: z.array(todoItemSchema),
  }),
  execute: async ({ inputData, mastra }) => {
    const agent = mastra?.getAgent("todo-decomposer-agent");
    if (!agent) throw new Error("todo-decomposer-agent not found");

    const response = await agent.generate([
      {
        role: "user",
        content: `今日の日付は ${inputData.today} です。\n以下の目標を Todo に分解してください:\n「${inputData.goal}」`,
      },
    ]);

    // JSON ブロックを抽出してパース
    const jsonMatch = response.text.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch) {
      throw new Error(`Todo の分解に失敗しました。エージェントの返答: ${response.text}`);
    }

    const todos = todoItemSchema.array().parse(JSON.parse(jsonMatch[1]));

    return { goal: inputData.goal, todos };
  },
});

// --- Step 2: 分解した Todo を Rails API に登録する ---

const registerTodosStep = createStep({
  id: "registerTodos",
  description: "分解した Todo を Rails API に1件ずつ登録する",
  inputSchema: z.object({
    goal:  z.string(),
    todos: z.array(todoItemSchema),
  }),
  outputSchema: z.object({
    goal:        z.string(),
    registered:  z.array(registeredTodoSchema),
    failedCount: z.number(),
  }),
  execute: async ({ inputData }) => {
    const registered: z.infer<typeof registeredTodoSchema>[] = [];
    let failedCount = 0;

    for (const todo of inputData.todos) {
      try {
        const res = await fetch(`${API_BASE}/todos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            todo: {
              title:       todo.title,
              description: todo.description ?? "",
              priority:    todo.priority,
              due_date:    todo.due_date,
            },
          }),
        });

        if (!res.ok) {
          failedCount++;
          continue;
        }

        const saved = (await res.json()) as { id: number; title: string; priority: string };
        registered.push({ id: saved.id, title: saved.title, priority: saved.priority });
      } catch {
        failedCount++;
      }
    }

    return { goal: inputData.goal, registered, failedCount };
  },
});

// --- Step 3: 登録結果をまとめて報告する ---

const summarizeStep = createStep({
  id: "summarize",
  description: "登録結果を日本語でまとめる",
  inputSchema: z.object({
    goal:        z.string(),
    registered:  z.array(registeredTodoSchema),
    failedCount: z.number(),
  }),
  outputSchema: z.object({
    message: z.string(),
  }),
  execute: async ({ inputData }) => {
    const priorityLabel: Record<string, string> = {
      high: "高", medium: "中", low: "低",
    };

    const list = inputData.registered
      .map((t, i) => `${i + 1}. ${t.title}（優先度: ${priorityLabel[t.priority] ?? t.priority}）`)
      .join("\n");

    const failNote = inputData.failedCount > 0
      ? `\n⚠️ ${inputData.failedCount} 件の登録に失敗しました。`
      : "";

    const message =
      `「${inputData.goal}」を達成するための ${inputData.registered.length} 件の Todo を登録しました:\n\n${list}${failNote}`;

    return { message };
  },
});

// --- Workflow 定義 ---

export const todoWorkflow = createWorkflow({
  id: "todo-workflow",
  name: "Todo Decompose & Register Workflow",
  description: "自然言語の目標を Todo に分解して Rails API に登録するパイプライン",
  inputSchema: z.object({
    goal:  z.string().describe("ユーザーのやりたいこと・目標"),
    today: z.string().describe("今日の日付（YYYY-MM-DD）"),
  }),
  outputSchema: z.object({
    message: z.string(),
  }),
})
  .then(decomposeGoalStep)
  .then(registerTodosStep)
  .then(summarizeStep);

todoWorkflow.commit();
```

### 3-3. index.ts にワークフローを追加

`frontend/src/mastra/index.ts`:

```typescript
import { todoWorkflow } from "./workflows/todo-workflow";

export const mastra = new Mastra({
  workflows: {
    weatherWorkflow,
    todoWorkflow,   // 追加
  },
  agents: {
    weatherAgent,
    todoAgent,
    receiptAnalyzerAgent,
    todoDecomposerAgent,
    todoOrchestratorAgent,
  },
  // ... 既存の設定
});
```

---

## 4. ステップ間のデータフロー

```
inputData: { goal: "来週の旅行準備をしたい", today: "2026-04-25" }
        │
        ▼
[decomposeGoalStep]
  inputSchema  : { goal, today }
  ↓ todoDecomposerAgent.generate() を呼んで JSON 抽出
  outputSchema : { goal, todos: TodoItem[] }
        │ 自動で次ステップの inputData に注入
        ▼
[registerTodosStep]
  inputSchema  : { goal, todos: TodoItem[] }
  ↓ fetch() で Rails API に1件ずつ POST
  outputSchema : { goal, registered: RegisteredTodo[], failedCount }
        │
        ▼
[summarizeStep]
  inputSchema  : { goal, registered, failedCount }
  ↓ 文字列整形のみ（LLM 不使用）
  outputSchema : { message: string }
        │
        ▼
result.steps["summarize"].output.message
→ 「来週の旅行準備をしたい」を達成するための 4 件の Todo を登録しました:
  1. ホテルの予約確認（優先度: 高）
  ...
```

---

## 5. フロントエンドからの呼び出し

```typescript
import { mastra } from "@/mastra";

async function runTodoWorkflow(goal: string) {
  const workflow = mastra.getWorkflow("todo-workflow");
  const run = await workflow.createRun();

  const result = await run.start({
    inputData: {
      goal,
      today: new Date().toISOString().split("T")[0], // "YYYY-MM-DD"
    },
  });

  if (result.status === "success") {
    return result.steps["summarize"].output.message;
  }

  // 失敗したステップを特定
  const failedStep = Object.entries(result.steps).find(
    ([, step]) => step.status === "failed"
  );
  throw new Error(`Workflow 失敗（step: ${failedStep?.[0] ?? "unknown"}）`);
}
```

---

## 6. Mastra Studio での確認

```bash
cd frontend
npx mastra dev  # http://localhost:4111
```

**Workflows タブ**で `todo-workflow` を選択すると:

```
[decomposeGoal] ──→ [registerTodos] ──→ [summarize]
     LLM呼び出し        API × N件          文字列整形
```

各ステップで以下が確認できる:
- 入力値・出力値（JSON）
- 実行時間
- エラーが発生した場合のスタックトレース

---

## 7. メリット・デメリット（オーケストレーター方式との比較）

| 観点 | Workflow 方式 | オーケストレーター方式 |
|---|---|---|
| **処理順序の保証** | コードで確定的に制御 | LLM の判断次第 |
| **型安全性** | ステップ間が `outputSchema` で型保証 | JSON テキストの受け渡しでパースミスリスクあり |
| **ステップ単位リトライ** | 可能（Step 2 だけ再実行できる） | 不可（エージェント全体を再実行） |
| **可視化** | Mastra Studio でステップグラフ表示 | toolCall の連鎖として表示 |
| **失敗の特定** | どのステップで失敗したか明確 | どのツール呼び出しで失敗したか追いにくい |
| **実装コスト** | Step 定義 × 3 + Workflow が必要 | エージェント2つ + instructions だけ |
| **柔軟性** | ステップ追加が `.then()` 1行 | instructions 変更だけで対応できることも |
| **LLM コスト** | 分解で1回のみ（登録・まとめは LLM 不使用） | 分解1回 + オーケストレーターが各ツール呼び出しを判断するため多い |

### 使い分けの指針

```
処理順序を確定させたい
フォールバック・エラーハンドリングを細かく制御したい
将来ステップを追加する可能性が高い
  → Workflow 方式

プロトタイプ・PoC 段階で素早く動かしたい
LLM が柔軟に判断する余地を残したい
  → オーケストレーター方式
```

---

## 8. 将来の拡張例

`.then()` でステップを差し込むだけで機能追加できる:

```typescript
export const todoWorkflow = createWorkflow({ ... })
  .then(decomposeGoalStep)
  .then(estimateDurationStep)   // 各 Todo の所要時間を推定するステップ
  .then(prioritizeTodosStep)    // 締め切りと所要時間から優先度を再計算するステップ
  .then(registerTodosStep)
  .then(summarizeStep);
```

---

## 9. チェックリスト

- [ ] `frontend/src/mastra/workflows/todo-workflow.ts` を作成
- [ ] `frontend/src/mastra/index.ts` の `workflows` に `todoWorkflow` を追加
- [ ] `npx mastra dev` で Mastra Studio を起動し `todo-workflow` のグラフを確認
- [ ] Studio の Workflows タブから直接 `{ goal: "...", today: "2026-04-25" }` を入力して動作確認
- [ ] Step 1 の出力 JSON が正しくパースされることを確認
- [ ] Step 2 で Rails API にTodoが登録されていることを確認
- [ ] フロントから `workflow.createRun()` → `run.start()` で呼び出して確認
