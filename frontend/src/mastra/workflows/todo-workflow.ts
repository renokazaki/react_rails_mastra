import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

const API_BASE = 'http://localhost:3000/api/v1';

// --- スキーマ定義 ---

const todoItemSchema = z.object({
  title:       z.string(),
  description: z.string().optional(),
  priority:    z.enum(['high', 'medium', 'low']),
  due_date:    z.string().nullable(),
});

const registeredTodoSchema = z.object({
  id:       z.number(),
  title:    z.string(),
  priority: z.string(),
});

// --- Step 1: 目標を Todo リストに分解する ---

const decomposeGoalStep = createStep({
  id: 'decomposeGoal',
  description: '自然言語の目標を具体的な Todo リストに分解する',
  inputSchema: z.object({
    goal:  z.string().describe('ユーザーのやりたいこと・目標'),
    today: z.string().describe('今日の日付（YYYY-MM-DD）。due_date の基準として使用'),
  }),
  outputSchema: z.object({
    goal:  z.string(),
    todos: z.array(todoItemSchema),
  }),
  execute: async ({ inputData, mastra }) => {
    const agent = mastra?.getAgent('todoDecomposerAgent');
    if (!agent) throw new Error('todo-decomposer-agent not found');

    const response = await agent.generate([
      {
        role: 'user',
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
  id: 'registerTodos',
  description: '分解した Todo を Rails API に1件ずつ登録する',
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
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            todo: {
              title:       todo.title,
              description: todo.description ?? '',
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
  id: 'summarize',
  description: '登録結果を日本語でまとめる',
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
      high: '高', medium: '中', low: '低',
    };

    const list = inputData.registered
      .map((t, i) => `${i + 1}. ${t.title}（優先度: ${priorityLabel[t.priority] ?? t.priority}）`)
      .join('\n');

    const failNote = inputData.failedCount > 0
      ? `\n⚠️ ${inputData.failedCount} 件の登録に失敗しました。`
      : '';

    const message =
      `「${inputData.goal}」を達成するための ${inputData.registered.length} 件の Todo を登録しました:\n\n${list}${failNote}`;

    return { message };
  },
});

// --- Workflow 定義 ---

export const todoWorkflow = createWorkflow({
  id: 'todo-workflow',
  name: 'Todo Decompose & Register Workflow',
  description: '自然言語の目標を Todo に分解して Rails API に登録するパイプライン',
  inputSchema: z.object({
    goal:  z.string().describe('ユーザーのやりたいこと・目標'),
    today: z.string().describe('今日の日付（YYYY-MM-DD）'),
  }),
  outputSchema: z.object({
    message: z.string(),
  }),
})
  .then(decomposeGoalStep)
  .then(registerTodosStep)
  .then(summarizeStep);

todoWorkflow.commit();
