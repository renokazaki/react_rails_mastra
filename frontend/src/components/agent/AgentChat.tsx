import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Bot, Send, Loader2, Network, GitBranch } from "lucide-react";

type Mode = "orchestrator" | "workflow";

interface Message {
  role: "user" | "assistant";
  content: string;
  mode?: Mode;
}

interface Props {
  onAction?: () => void;
}

const MODE_CONFIG: Record<Mode, {
  label: string;
  icon: React.ReactNode;
  description: string;
  placeholder: string;
  badgeClass: string;
}> = {
  orchestrator: {
    label: "サブエージェント",
    icon: <Network className="h-3.5 w-3.5" />,
    description: "オーケストレーターがサブエージェントに委譲してTodoを分解・登録",
    placeholder: "やりたいことを入力... (例: 来週の旅行準備をしたい)",
    badgeClass: "bg-violet-100 text-violet-700 border-violet-200",
  },
  workflow: {
    label: "ワークフロー",
    icon: <GitBranch className="h-3.5 w-3.5" />,
    description: "Workflowのパイプラインで順番に分解・登録（型安全・ステップ単位で確定実行）",
    placeholder: "目標を入力... (例: 3ヶ月でフルスタックエンジニアになる)",
    badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
  },
};

export function AgentChat({ onAction }: Props) {
  const MASTRA_API_BASE =
    import.meta.env.VITE_MASTRA_API_BASE_URL ?? "http://localhost:4111/api";

  const [mode, setMode] = useState<Mode>("orchestrator");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "こんにちは！やりたいことを入力すると、Todoに分解して登録します。\nモードを切り替えて2つの実装方式を試せます。",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendOrchestrator = async (userMessage: string) => {
    const payloadMessages = [
      ...messages
        .filter((m) => !m.mode || m.mode === "orchestrator")
        .map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: userMessage },
    ];

    const response = await fetch(
      `${MASTRA_API_BASE}/agents/todo-orchestrator-agent/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payloadMessages }),
      }
    );

    const result = (await response.json()) as {
      text?: string;
      error?: string;
      toolCalls?: unknown[];
    };

    if (!response.ok || result.error) {
      throw new Error(result.error ?? `API error: ${response.status}`);
    }

    if (result.toolCalls && result.toolCalls.length > 0) onAction?.();

    return result.text ?? "応答を取得できませんでした。";
  };

  const sendWorkflow = async (userMessage: string) => {
    const today = new Date().toISOString().split("T")[0];

    const response = await fetch(
      `${MASTRA_API_BASE}/workflows/todo-workflow/start-async`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputData: { goal: userMessage, today },
        }),
      }
    );

    const result = (await response.json()) as {
      result?: { message?: string };
      steps?: Record<string, { output?: { message?: string } }>;
      error?: string;
    };

    if (!response.ok || result.error) {
      throw new Error(result.error ?? `API error: ${response.status}`);
    }

    // Workflow の最終ステップ出力を取得
    const message =
      result.result?.message ??
      result.steps?.["summarize"]?.output?.message ??
      "ワークフローが完了しました。";

    onAction?.();
    return message;
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage, mode }]);
    setLoading(true);

    try {
      const text =
        mode === "orchestrator"
          ? await sendOrchestrator(userMessage)
          : await sendWorkflow(userMessage);

      setMessages((prev) => [...prev, { role: "assistant", content: text, mode }]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `エラーが発生しました: ${e instanceof Error ? e.message : "不明なエラー"}`,
          mode,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const currentConfig = MODE_CONFIG[mode];

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          size="icon"
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50"
        >
          <Bot className="h-6 w-6" />
        </Button>
      </SheetTrigger>

      <SheetContent className="w-full sm:w-[440px] flex flex-col p-0">
        <SheetHeader className="p-4 border-b space-y-3">
          <SheetTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Todo アシスタント
          </SheetTitle>

          {/* モード切り替えタブ */}
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList className="w-full">
              <TabsTrigger value="orchestrator" className="flex-1 gap-1.5 text-xs">
                <Network className="h-3.5 w-3.5" />
                サブエージェント
              </TabsTrigger>
              <TabsTrigger value="workflow" className="flex-1 gap-1.5 text-xs">
                <GitBranch className="h-3.5 w-3.5" />
                ワークフロー
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* モードの説明 */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            {currentConfig.description}
          </p>
        </SheetHeader>

        {/* メッセージ一覧 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              {/* モードバッジ（ユーザーメッセージにのみ表示） */}
              {msg.role === "user" && msg.mode && (
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 flex items-center gap-1 ${MODE_CONFIG[msg.mode].badgeClass}`}
                >
                  {MODE_CONFIG[msg.mode].icon}
                  {MODE_CONFIG[msg.mode].label}
                </Badge>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted text-foreground rounded-bl-sm"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-start gap-2">
              <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-2 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {mode === "workflow" ? "ワークフロー実行中..." : "エージェント思考中..."}
                </span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* 入力欄 */}
        <div className="p-4 border-t space-y-2">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={currentConfig.placeholder}
              disabled={loading}
              className="flex-1 text-sm"
            />
            <Button
              size="icon"
              onClick={() => void sendMessage()}
              disabled={!input.trim() || loading}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
