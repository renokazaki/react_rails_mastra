import { useState, useEffect, useCallback } from "react";
import { todosApi } from "@/lib/api";
import type { Todo, CreateTodoInput, UpdateTodoInput, TodoFilters } from "@/types/todo";

export function useTodos(filters?: TodoFilters) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await todosApi.list(filters);
      setTodos(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [filters?.status, filters?.priority, filters?.q]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const createTodo = useCallback(async (input: CreateTodoInput) => {
    const todo = await todosApi.create(input);
    setTodos((prev) => [todo, ...prev]);
    return todo;
  }, []);

  const updateTodo = useCallback(async (id: number, input: UpdateTodoInput) => {
    const todo = await todosApi.update(id, input);
    setTodos((prev) => prev.map((t) => (t.id === id ? todo : t)));
    return todo;
  }, []);

  const deleteTodo = useCallback(async (id: number) => {
    await todosApi.delete(id);
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toggleTodo = useCallback(
    async (id: number, currentStatus: "pending" | "completed") => {
      return updateTodo(id, { status: currentStatus === "pending" ? "completed" : "pending" });
    },
    [updateTodo]
  );

  return { todos, loading, error, refetch: fetch, createTodo, updateTodo, deleteTodo, toggleTodo };
}
