import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Header } from "@/components/layout/Header";
import { TodoFilters } from "@/components/todo/TodoFilters";
import { TodoList } from "@/components/todo/TodoList";
import { TodoFormDialog } from "@/components/todo/TodoFormDialog";
import { Button } from "@/components/ui/button";
import { useTodos } from "@/hooks/useTodos";
import type {
  TodoFilters as Filters,
  CreateTodoInput,
  UpdateTodoInput,
} from "@/types/todo";
import { Plus } from "lucide-react";
import { AgentChat } from "./components/agent/AgentChat";

export default function App() {
  const [filters, setFilters] = useState<Filters>({});
  const [addOpen, setAddOpen] = useState(false);

  const {
    todos,
    loading,
    error,
    refetch,
    createTodo,
    updateTodo,
    deleteTodo,
    toggleTodo,
  } = useTodos(filters);

  const handleCreate = async (input: CreateTodoInput | UpdateTodoInput) => {
    try {
      await createTodo(input as CreateTodoInput);
      toast.success("Todo を追加しました");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "追加に失敗しました");
      throw e;
    }
  };

  const handleUpdate = async (id: number, input: UpdateTodoInput) => {
    try {
      await updateTodo(id, input);
      toast.success("Todo を更新しました");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "更新に失敗しました");
      throw e;
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteTodo(id);
      toast.success("Todo を削除しました");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "削除に失敗しました");
      throw e;
    }
  };

  const handleToggle = async (id: number, status: "pending" | "completed") => {
    try {
      await toggleTodo(id, status);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "更新に失敗しました");
      throw e;
    }
  };

  const pending = todos.filter((t) => t.status === "pending").length;
  const completed = todos.filter((t) => t.status === "completed").length;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "合計", value: todos.length },
            { label: "未完了", value: pending },
            { label: "完了", value: completed },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-xl border bg-card p-4 text-center"
            >
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <TodoFilters filters={filters} onChange={setFilters} />

        {/* Add button */}
        <Button
          onClick={() => setAddOpen(true)}
          className="w-full gap-2"
          size="lg"
        >
          <Plus className="h-4 w-4" />
          新しい Todo を追加
        </Button>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* List */}
        <TodoList
          todos={todos}
          loading={loading}
          onToggle={handleToggle}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      </main>

      <TodoFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSubmit={handleCreate}
      />
      <Toaster richColors position="bottom-right" />
      <AgentChat onAction={refetch} />
    </div>
  );
}
