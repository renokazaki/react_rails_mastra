import { Badge } from "@/components/ui/badge";
import type { Priority } from "@/types/todo";

const config: Record<Priority, { label: string; className: string }> = {
  high: { label: "高", className: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400" },
  medium: { label: "中", className: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400" },
  low: { label: "低", className: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400" },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { label, className } = config[priority];
  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}
