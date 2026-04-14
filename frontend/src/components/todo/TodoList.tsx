import { TodoCard } from "./TodoCard";
import type { Todo, UpdateTodoInput } from "@/types/todo";
import { CheckCircle2 } from "lucide-react";

interface Props {
  todos: Todo[];
  loading: boolean;
  onToggle: (id: number, status: "pending" | "completed") => Promise<void>;
  onUpdate: (id: number, input: UpdateTodoInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export function TodoList({ todos, loading, onToggle, onUpdate, onDelete }: Props) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (todos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <CheckCircle2 className="h-12 w-12 mb-3 opacity-30" />
        <p className="text-sm">Todo がありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {todos.map((todo) => (
        <TodoCard
          key={todo.id}
          todo={todo}
          onToggle={onToggle}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
