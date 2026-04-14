import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { PriorityBadge } from "./PriorityBadge";
import { TodoFormDialog } from "./TodoFormDialog";
import type { Todo, UpdateTodoInput } from "@/types/todo";
import { Pencil, Trash2, Calendar } from "lucide-react";

interface Props {
  todo: Todo;
  onToggle: (id: number, status: "pending" | "completed") => Promise<void>;
  onUpdate: (id: number, input: UpdateTodoInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export function TodoCard({ todo, onToggle, onUpdate, onDelete }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    setToggling(true);
    try {
      await onToggle(todo.id, todo.status);
    } finally {
      setToggling(false);
    }
  };

  const handleUpdate = async (input: UpdateTodoInput) => {
    await onUpdate(todo.id, input);
  };

  const handleDelete = async () => {
    await onDelete(todo.id);
    setDeleteOpen(false);
  };

  const isCompleted = todo.status === "completed";

  return (
    <>
      <Card className={`transition-all duration-200 hover:shadow-md ${isCompleted ? "opacity-60" : ""}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={isCompleted}
              onCheckedChange={() => void handleToggle()}
              disabled={toggling}
              className="mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`font-medium text-sm leading-tight ${isCompleted ? "line-through text-muted-foreground" : ""}`}>
                  {todo.title}
                </span>
                <PriorityBadge priority={todo.priority} />
                {isCompleted && (
                  <Badge variant="secondary" className="text-xs">完了</Badge>
                )}
              </div>
              {todo.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{todo.description}</p>
              )}
              {todo.due_date && (
                <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>{new Date(todo.due_date).toLocaleDateString("ja-JP")}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <TodoFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        todo={todo}
        onSubmit={handleUpdate}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Todo を削除</DialogTitle>
            <DialogDescription>
              「{todo.title}」を削除しますか？この操作は元に戻せません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>キャンセル</Button>
            <Button variant="destructive" onClick={() => void handleDelete()}>削除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
