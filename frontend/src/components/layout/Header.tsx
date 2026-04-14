import { CheckSquare } from "lucide-react";

export function Header() {
  return (
    <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
        <div className="flex items-center gap-2 text-primary">
          <CheckSquare className="h-5 w-5" />
          <span className="font-semibold text-lg tracking-tight">TodoApp</span>
        </div>
      </div>
    </header>
  );
}
