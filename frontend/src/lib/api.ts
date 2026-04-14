import type { Todo, CreateTodoInput, UpdateTodoInput, TodoFilters } from "@/types/todo";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { errors?: string[] }).errors?.join(", ") ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const todosApi = {
  list(filters?: TodoFilters): Promise<Todo[]> {
    const params = new URLSearchParams();
    if (filters?.status && filters.status !== "all") params.set("status", filters.status);
    if (filters?.priority && filters.priority !== "all") params.set("priority", filters.priority);
    if (filters?.q) params.set("q", filters.q);
    const qs = params.toString();
    return request<Todo[]>(`/todos${qs ? `?${qs}` : ""}`);
  },

  get(id: number): Promise<Todo> {
    return request<Todo>(`/todos/${id}`);
  },

  create(input: CreateTodoInput): Promise<Todo> {
    return request<Todo>("/todos", {
      method: "POST",
      body: JSON.stringify({ todo: input }),
    });
  },

  update(id: number, input: UpdateTodoInput): Promise<Todo> {
    return request<Todo>(`/todos/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ todo: input }),
    });
  },

  delete(id: number): Promise<void> {
    return request<void>(`/todos/${id}`, { method: "DELETE" });
  },
};
