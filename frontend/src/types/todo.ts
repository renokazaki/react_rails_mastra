export type Priority = "low" | "medium" | "high";
export type Status = "pending" | "completed";

export interface Todo {
  id: number;
  title: string;
  description: string | null;
  status: Status;
  priority: Priority;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTodoInput {
  title: string;
  description?: string;
  priority?: Priority;
  due_date?: string;
}

export interface UpdateTodoInput {
  title?: string;
  description?: string;
  status?: Status;
  priority?: Priority;
  due_date?: string;
}

export interface TodoFilters {
  status?: Status | "all";
  priority?: Priority | "all";
  q?: string;
}
