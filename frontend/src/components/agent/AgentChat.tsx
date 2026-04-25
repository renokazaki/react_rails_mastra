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
import {
  Bot,
  Send,
  Loader2,
  Network,
  GitBranch,
  Receipt,
  ImagePlus,
  X,
} from "lucide-react";

type Mode = "orchestrator" | "workflow" | "receipt";

interface Message {
  role: "user" | "assistant";
  content: string;
  mode?: Mode;
  imagePreview?: string;
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
  receipt: {
    label: "レシート分析",
    icon: <Receipt className="h-3.5 w-3.5" />,
    description: "レシート画像をアップロードすると内容を読み取りJSON形式で返します",
    placeholder: "補足コメントを入力（任意）",
    badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
};

export function AgentChat({ onAction }: Props) {
  const MASTRA_API_BASE =
    import.meta.env.VITE_MASTRA_API_BASE_URL ?? "http://localhost:4111/api";

  const [mode, setMode] = useState<Mode>("orchestrator");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "こんにちは！タブを切り替えて機能を選んでください。\n• サブエージェント / ワークフロー: やりたいことをTodoに分解・登録\n• レシート分析: 画像をアップロードして内容を読み取り",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // モード切り替え時に画像をリセット
  const handleModeChange = (v: string) => {
    setMode(v as Mode);
    clearImage();
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  // --- API 呼び出し ---

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
        body: JSON.stringify({ inputData: { goal: userMessage, today } }),
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

    const message =
      result.result?.message ??
      result.steps?.["summarize"]?.output?.message ??
      "ワークフローが完了しました。";

    onAction?.();
    return message;
  };

  const sendReceipt = async (comment: string) => {
    if (!imageFile || !imagePreview) throw new Error("画像を選択してください");

    // dataURL から base64 部分を取り出す
    const base64 = imagePreview.split(",")[1];
    const mimeType = imageFile.type || "image/jpeg";

    const contentParts: object[] = [
      {
        type: "image",
        image: base64,
        mimeType,
      },
    ];
    if (comment) {
      contentParts.unshift({ type: "text", text: comment });
    } else {
      contentParts.unshift({ type: "text", text: "このレシートを分析してください" });
    }

    const response = await fetch(
      `${MASTRA_API_BASE}/agents/receiptAnalyzerAgent/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: contentParts }],
        }),
      }
    );

    const result = (await response.json()) as {
      text?: string;
      error?: string;
    };

    if (!response.ok || result.error) {
      throw new Error(result.error ?? `API error: ${response.status}`);
    }

    clearImage();
    return result.text ?? "応答を取得できませんでした。";
  };

  // --- 送信 ---

  const canSend =
    mode === "receipt"
      ? !!imageFile && !loading
      : !!input.trim() && !loading;

  const sendMessage = async () => {
    if (!canSend) return;

    const userMessage = input.trim();
    setInput("");

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content:
          mode === "receipt"
            ? userMessage || "レシートを分析してください"
            : userMessage,
        mode,
        imagePreview: mode === "receipt" ? (imagePreview ?? undefined) : undefined,
      },
    ]);
    setLoading(true);

    try {
      let text: string;
      if (mode === "orchestrator") text = await sendOrchestrator(userMessage);
      else if (mode === "workflow") text = await sendWorkflow(userMessage);
      else text = await sendReceipt(userMessage);

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: text, mode },
      ]);
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
            AI アシスタント
          </SheetTitle>

          {/* モード切り替えタブ */}
          <Tabs value={mode} onValueChange={handleModeChange}>
            <TabsList className="w-full">
              <TabsTrigger value="orchestrator" className="flex-1 gap-1 text-xs px-1">
                <Network className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">サブエージェント</span>
              </TabsTrigger>
              <TabsTrigger value="workflow" className="flex-1 gap-1 text-xs px-1">
                <GitBranch className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">ワークフロー</span>
              </TabsTrigger>
              <TabsTrigger value="receipt" className="flex-1 gap-1 text-xs px-1">
                <Receipt className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">レシート</span>
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
              {/* モードバッジ */}
              {msg.role === "user" && msg.mode && (
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 flex items-center gap-1 ${MODE_CONFIG[msg.mode].badgeClass}`}
                >
                  {MODE_CONFIG[msg.mode].icon}
                  {MODE_CONFIG[msg.mode].label}
                </Badge>
              )}

              {/* 画像プレビュー（レシートモード） */}
              {msg.imagePreview && (
                <img
                  src={msg.imagePreview}
                  alt="アップロード画像"
                  className="max-w-[200px] rounded-xl border shadow-sm"
                />
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
            <div className="flex items-start">
              <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-2 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {mode === "workflow"
                    ? "ワークフロー実行中..."
                    : mode === "receipt"
                    ? "レシート分析中..."
                    : "エージェント思考中..."}
                </span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* 入力欄 */}
        <div className="p-4 border-t space-y-2">
          {/* レシートモード: 画像アップロードエリア */}
          {mode === "receipt" && (
            <div>
              {imagePreview ? (
                /* 選択済み: プレビュー + 削除ボタン */
                <div className="relative inline-block">
                  <img
                    src={imagePreview}
                    alt="選択中の画像"
                    className="h-24 w-auto rounded-lg border object-cover"
                  />
                  <button
                    onClick={clearImage}
                    className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full h-5 w-5 flex items-center justify-center shadow"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                /* 未選択: アップロードボタン */
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-muted-foreground/30 rounded-xl py-6 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                >
                  <ImagePlus className="h-7 w-7" />
                  <span className="text-xs">クリックして画像を選択</span>
                  <span className="text-[10px]">JPG / PNG / WEBP</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          )}

          {/* テキスト入力 + 送信ボタン */}
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
              disabled={!canSend}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
