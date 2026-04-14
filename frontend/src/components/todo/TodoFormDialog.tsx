import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Todo, CreateTodoInput, UpdateTodoInput, Priority, Status } from "@/types/todo";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  todo?: Todo;
  onSubmit: (data: CreateTodoInput | UpdateTodoInput) => Promise<void>;
}

export function TodoFormDialog({ open, onOpenChange, todo, onSubmit }: Props) {
  const [title, setTitle] = useState(todo?.title ?? "");
  const [description, setDescription] = useState(todo?.description ?? "");
  const [priority, setPriority] = useState<Priority>(todo?.priority ?? "medium");
  const [status, setStatus] = useState<Status>(todo?.status ?? "pending");
  const [dueDate, setDueDate] = useState(todo?.due_date ?? "");
  const [loading, setLoading] = useState(false);

  const isEdit = !!todo;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    try {
      const data = isEdit
        ? ({ title, description: description || undefined, priority, status, due_date: dueDate || undefined } as UpdateTodoInput)
        : ({ title, description: description || undefined, priority, due_date: dueDate || undefined } as CreateTodoInput);
      await onSubmit(data);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Todo を編集" : "新しい Todo を追加"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">タイトル *</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="タイトルを入力..."
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">説明</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="詳細を入力..."
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">優先度</label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">高</SelectItem>
                  <SelectItem value="medium">中</SelectItem>
                  <SelectItem value="low">低</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isEdit && (
              <div className="space-y-2">
                <label className="text-sm font-medium">ステータス</label>
                <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">未完了</SelectItem>
                    <SelectItem value="completed">完了</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">期限日</label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button type="submit" disabled={loading || !title.trim()}>
              {loading ? "保存中..." : isEdit ? "更新" : "追加"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
