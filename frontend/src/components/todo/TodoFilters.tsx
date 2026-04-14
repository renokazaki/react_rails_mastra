import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TodoFilters as Filters } from "@/types/todo";
import { Search } from "lucide-react";

interface Props {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

export function TodoFilters({ filters, onChange }: Props) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="キーワードで検索..."
          value={filters.q ?? ""}
          onChange={(e) => onChange({ ...filters, q: e.target.value || undefined })}
        />
      </div>
      <Select
        value={filters.status ?? "all"}
        onValueChange={(v) => onChange({ ...filters, status: v as Filters["status"] })}
      >
        <SelectTrigger className="w-full sm:w-36">
          <SelectValue placeholder="ステータス" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">すべて</SelectItem>
          <SelectItem value="pending">未完了</SelectItem>
          <SelectItem value="completed">完了</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={filters.priority ?? "all"}
        onValueChange={(v) => onChange({ ...filters, priority: v as Filters["priority"] })}
      >
        <SelectTrigger className="w-full sm:w-36">
          <SelectValue placeholder="優先度" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">すべての優先度</SelectItem>
          <SelectItem value="high">高</SelectItem>
          <SelectItem value="medium">中</SelectItem>
          <SelectItem value="low">低</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
