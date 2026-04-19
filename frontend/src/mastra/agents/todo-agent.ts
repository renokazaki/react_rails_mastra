import { Agent } from "@mastra/core/agent";
import {
  listTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  completeTodo,
} from "../tools/todo-tool";

export const todoAgent = new Agent({
  id: "todo-agent",
  name: "Todo Assistant",

  // エージェントへの指示（System Prompt に相当）
  instructions: `
    あなたは Todo アプリのアシスタントです。
    ユーザーの日本語の指示を理解して、適切なツールを使って Todo を操作してください。

    ルール:
    - 操作する前に何をするかを一言で伝えてください
    - 操作後は結果を日本語で報告してください
    - 複数の Todo を操作する場合は、一つずつ処理してください
    - 存在するかどうかわからない Todo を操作する場合は、まず listTodos で確認してください
    - 曖昧な指示（「古いタスク」「完了していないもの」など）は listTodos で確認してから操作してください
  `,

  // 使用するモデル 以下からrateを確認しながらmodel変更
  //https://aistudio.google.com/rate-limit?timeRange=last-28-days
  model: "google/gemini-2.5-flash",

  // 使えるツール
  tools: { listTodos, createTodo, updateTodo, deleteTodo, completeTodo },
});
