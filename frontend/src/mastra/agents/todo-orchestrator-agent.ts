import { Agent } from "@mastra/core/agent";
import { createTodo } from "../tools/todo-tool";
import { todoDecomposerAgent } from "./todo-decomposer-agent";

export const todoOrchestratorAgent = new Agent({
  id: "todo-orchestrator-agent",
  name: "Todo Orchestrator Agent",
  instructions: `
あなたはTodo管理のオーケストレーターです。
ユーザーの「やりたいこと」や「目標」を受け取り、以下の手順で処理してください。

【処理手順】
1. agent-todoDecomposer を呼び出し、やりたいことを具体的なTodoリストに分解してもらう
2. 返ってきたJSON配列を解析する
3. 各Todoを createTodo ツールで Rails API に登録する（1件ずつ順番に）
4. 全件登録完了後、登録したTodo一覧を日本語で報告する

【報告形式】
「以下の X 件のTodoを登録しました：
1. [タイトル]（優先度: 高/中/低）
2. ...
」

【注意事項】
- Todoの登録は必ず1件ずつ順番に行うこと
- 分解エージェントからJSONが返らない場合は再度依頼すること
- 登録失敗したTodoがあれば、その旨を報告すること
- priority の日本語変換: high→高, medium→中, low→低
  `,
  model: 'google/gemini-2.5-flash',

  // サブエージェントを登録 → "agent-todoDecomposer" ツールとして自動変換される
  agents: {
    todoDecomposer: todoDecomposerAgent,
  },

  // Rails API への登録ツール
  tools: { createTodo },
});
