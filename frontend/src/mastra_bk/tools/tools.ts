import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const API_BASE = "http://localhost:3000/api/v1";

// --- 共通: API を叩く関数 ---
async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

// --- ツール 1: Todo 一覧取得 ---
export const listTodos = createTool({
  id: "listTodos",
  description: "Todo の一覧を取得する。ステータス・優先度でフィルタできる",
  inputSchema: z.object({
    status: z
      .enum(["pending", "completed"])
      .optional()
      .describe("フィルタするステータス"),
    priority: z
      .enum(["low", "medium", "high"])
      .optional()
      .describe("フィルタする優先度"),
  }),
  execute: async (inputData) => {
    const params = new URLSearchParams();
    if (inputData.status) params.set("status", inputData.status);
    if (inputData.priority) params.set("priority", inputData.priority);
    const qs = params.toString();
    return apiRequest(`/todos${qs ? `?${qs}` : ""}`);
  },
});

// --- ツール 2: Todo 作成 ---
export const createTodo = createTool({
  id: "createTodo",
  description: "新しい Todo を作成する",
  inputSchema: z.object({
    title: z.string().describe("Todo のタイトル（必須）"),
    description: z.string().optional().describe("詳細説明"),
    priority: z
      .enum(["low", "medium", "high"])
      .optional()
      .describe("優先度（デフォルト: medium）"),
    due_date: z.string().optional().describe("期限日 YYYY-MM-DD 形式"),
  }),
  execute: async (inputData) => {
    return apiRequest("/todos", {
      method: "POST",
      body: JSON.stringify({ todo: inputData }),
    });
  },
});

// --- ツール 3: Todo 更新 ---
export const updateTodo = createTool({
  id: "updateTodo",
  description: "既存の Todo を更新する（ステータス変更・優先度変更など）",
  inputSchema: z.object({
    id: z.number().describe("更新する Todo の ID"),
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["pending", "completed"]).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    due_date: z.string().optional(),
  }),
  execute: async (inputData) => {
    const { id, ...fields } = inputData;
    return apiRequest(`/todos/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ todo: fields }),
    });
  },
});

// --- ツール 4: Todo 削除 ---
export const deleteTodo = createTool({
  id: "deleteTodo",
  description: "指定した ID の Todo を削除する",
  inputSchema: z.object({
    id: z.number().describe("削除する Todo の ID"),
  }),
  execute: async (inputData) => {
    await apiRequest(`/todos/${inputData.id}`, { method: "DELETE" });
    return { success: true, id: inputData.id };
  },
});

// --- ツール 5: Todo 完了にする（updateTodo のショートカット）---
export const completeTodo = createTool({
  id: "completeTodo",
  description: "Todo を完了状態にする",
  inputSchema: z.object({
    id: z.number().describe("完了にする Todo の ID"),
  }),
  execute: async (inputData) => {
    return apiRequest(`/todos/${inputData.id}`, {
      method: "PATCH",
      body: JSON.stringify({ todo: { status: "completed" } }),
    });
  },
});
