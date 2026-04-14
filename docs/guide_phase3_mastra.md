# Phase 3 ハンズオンガイド — Mastra で AI エージェントを導入する

> **目標**: Mastra を使って「自然言語で Todo を操作できる AI エージェント」を React アプリに組み込む。
> **前提**: Phase 1（Rails API）と Phase 2（React UI）が完成していること。

---

## 0. Mastra とは

**Mastra** は TypeScript 製の AI エージェントフレームワーク。  
「エージェント」「ツール」「ワークフロー」を宣言的に定義でき、Claude や GPT などのモデルと繋げられる。

### 核となる 3 つの概念

| 概念 | 役割 | 例 |
|---|---|---|
| **Agent** | 会話の司令塔。指示・モデル・ツールをまとめる | `todoAgent` |
| **Tool** | エージェントが実行できる具体的なアクション | `createTodo`, `deleteTodo` |
| **Model** | 裏で動く LLM | `claude-sonnet-4-6` |

---

## 1. インストール

```bash
cd frontend
npm install @mastra/core @ai-sdk/anthropic
```

> **なぜ `@ai-sdk/anthropic`?**  
> Mastra は [Vercel AI SDK](https://sdk.vercel.ai/) のモデルアダプターを使う。  
> Anthropic のモデルを使うにはこのパッケージが必要。

---

## 2. ディレクトリ構成

```
frontend/src/
└── mastra/
    ├── tools.ts    # ツール定義（API 呼び出し）
    └── agent.ts    # エージェント定義
```

```bash
mkdir -p frontend/src/mastra
```

---

## 3. ツールを定義する

**ツール**= エージェントが「何かをする」ための関数。  
各ツールには「説明」と「入力スキーマ」と「実行関数」の 3 点セットが必要。

`frontend/src/mastra/tools.ts` を作成:

```typescript
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

// --- 共通: API を叩く関数 ---
async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

// --- ツール 1: Todo 一覧取得 ---
export const listTodos = createTool({
  id: "listTodos",
  description: "Todo の一覧を取得する。ステータス・優先度でフィルタできる",
  inputSchema: z.object({
    status: z.enum(["pending", "completed"]).optional()
      .describe("フィルタするステータス"),
    priority: z.enum(["low", "medium", "high"]).optional()
      .describe("フィルタする優先度"),
  }),
  execute: async ({ context }) => {
    const params = new URLSearchParams();
    if (context.status) params.set("status", context.status);
    if (context.priority) params.set("priority", context.priority);
    const qs = params.toString();
    return apiRequest(`/todos${qs ? `?${qs}` : ""}`);
  },
});

// --- ツール 2: Todo 作成 ---
export const createTodo = createTool({
  id: "createTodo",
  description: "新しい Todo を作成する",
  inputSchema: z.object({
    title: z.string().describe("Todo のタイトル（必須）"),
    description: z.string().optional().describe("詳細説明"),
    priority: z.enum(["low", "medium", "high"]).optional()
      .describe("優先度（デフォルト: medium）"),
    due_date: z.string().optional().describe("期限日 YYYY-MM-DD 形式"),
  }),
  execute: async ({ context }) => {
    return apiRequest("/todos", {
      method: "POST",
      body: JSON.stringify({ todo: context }),
    });
  },
});

// --- ツール 3: Todo 更新 ---
export const updateTodo = createTool({
  id: "updateTodo",
  description: "既存の Todo を更新する（ステータス変更・優先度変更など）",
  inputSchema: z.object({
    id: z.number().describe("更新する Todo の ID"),
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["pending", "completed"]).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    due_date: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const { id, ...fields } = context;
    return apiRequest(`/todos/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ todo: fields }),
    });
  },
});

// --- ツール 4: Todo 削除 ---
export const deleteTodo = createTool({
  id: "deleteTodo",
  description: "指定した ID の Todo を削除する",
  inputSchema: z.object({
    id: z.number().describe("削除する Todo の ID"),
  }),
  execute: async ({ context }) => {
    await apiRequest(`/todos/${context.id}`, { method: "DELETE" });
    return { success: true, id: context.id };
  },
});

// --- ツール 5: Todo 完了にする（updateTodo のショートカット）---
export const completeTodo = createTool({
  id: "completeTodo",
  description: "Todo を完了状態にする",
  inputSchema: z.object({
    id: z.number().describe("完了にする Todo の ID"),
  }),
  execute: async ({ context }) => {
    return apiRequest(`/todos/${context.id}`, {
      method: "PATCH",
      body: JSON.stringify({ todo: { status: "completed" } }),
    });
  },
});
```

> **ポイント: `description` は超重要**  
> AI モデルは description を読んで「どのツールをいつ使うか」を判断する。  
> 具体的で明確な説明を書くほど、エージェントの精度が上がる。

---

## 4. エージェントを定義する

`frontend/src/mastra/agent.ts` を作成:

```typescript
import { Agent } from "@mastra/core/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { listTodos, createTodo, updateTodo, deleteTodo, completeTodo } from "./tools";

export const todoAgent = new Agent({
  name: "Todo Assistant",

  // エージェントへの指示（System Prompt に相当）
  instructions: `
    あなたは Todo アプリのアシスタントです。
    ユーザーの日本語の指示を理解して、適切なツールを使って Todo を操作してください。

    ルール:
    - 操作する前に何をするかを一言で伝えてください
    - 操作後は結果を日本語で報告してください
    - 複数の Todo を操作する場合は、一つずつ処理してください
    - 存在するかどうかわからない Todo を操作する場合は、まず listTodos で確認してください
    - 曖昧な指示（「古いタスク」「完了していないもの」など）は listTodos で確認してから操作してください
  `,

  // 使用するモデル
  model: anthropic("claude-sonnet-4-6"),

  // 使えるツール
  tools: { listTodos, createTodo, updateTodo, deleteTodo, completeTodo },
});
```

---

## 5. 環境変数の設定

`frontend/.env.local` に Anthropic の API キーを追加:

```
VITE_API_BASE_URL=http://localhost:3000/api/v1
VITE_ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx
```

> **注意**: `VITE_` プレフィックスをつけると Vite がブラウザのコードにバンドルする。  
> 本番環境ではサーバーサイドで処理するべきだが、今は練習なのでこのまま進める。

Mastra がブラウザで動くよう、`vite.config.ts` に API キーを渡す設定を追加する必要がある。  
`@ai-sdk/anthropic` の初期化時にキーを渡す方法:

```typescript
// frontend/src/mastra/agent.ts の import 部分を修正
import { createAnthropic } from "@ai-sdk/anthropic";

const anthropicProvider = createAnthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
});

// model: の行を変更
model: anthropicProvider("claude-sonnet-4-6"),
```

---

## 6. チャット UI コンポーネントを作る

`frontend/src/components/agent/AgentChat.tsx` を作成:

```tsx
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { todoAgent } from "@/mastra/agent";
import { Bot, Send, Loader2 } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  onAction?: () => void; // AI が操作したら Todo リストを再取得するコールバック
}

export function AgentChat({ onAction }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "こんにちは！Todo の管理をお手伝いします。何かお気軽にどうぞ。" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 新しいメッセージが来たら一番下にスクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      // エージェントにメッセージを送信
      const result = await todoAgent.generate([
        // 過去のメッセージも渡して文脈を維持する
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userMessage },
      ]);

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.text },
      ]);

      // ツールを使った（= Todo を操作した）場合は親コンポーネントに通知
      if (result.toolCalls && result.toolCalls.length > 0) {
        onAction?.();
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `エラーが発生しました: ${e instanceof Error ? e.message : "不明なエラー"}`,
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

  return (
    <Sheet>
      {/* トリガーボタン（画面右下に固定） */}
      <SheetTrigger asChild>
        <Button
          size="icon"
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50"
        >
          <Bot className="h-6 w-6" />
        </Button>
      </SheetTrigger>

      {/* チャットパネル */}
      <SheetContent className="w-full sm:w-[420px] flex flex-col p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI アシスタント
          </SheetTitle>
        </SheetHeader>

        {/* メッセージ一覧 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
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
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* 入力欄 */}
        <div className="p-4 border-t flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="メッセージを入力... (Enter で送信)"
            disabled={loading}
            className="flex-1"
          />
          <Button
            size="icon"
            onClick={() => void sendMessage()}
            disabled={!input.trim() || loading}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

---

## 7. App.tsx に組み込む

`frontend/src/App.tsx` に `AgentChat` を追加する:

```tsx
// 追加するimport
import { AgentChat } from "@/components/agent/AgentChat";

// useTodos から refetch を取得（既にあるはず）
const { todos, loading, error, refetch, createTodo, ... } = useTodos(filters);

// JSX の最後（Toaster の前あたり）に追加
<AgentChat onAction={refetch} />
```

> **`onAction={refetch}` の役割**:  
> AI が Todo を作成・更新・削除したとき、`refetch` が呼ばれて画面の Todo リストが自動更新される。

---

## 8. 動作確認

### 試してみるプロンプト例

```
「買い物リストを作成するタスクを追加して」
→ createTodo ツールが呼ばれる

「未完了のタスクを全部教えて」
→ listTodos(status: "pending") が呼ばれる

「優先度が高いタスクを完了にして」
→ listTodos → completeTodo の順にツールが呼ばれる

「今日中にやるべきことをまとめて」
→ listTodos で取得して AI が整理して返す
```

---

## 9. 仕組みの深掘り

### エージェントがツールを使う流れ

```
ユーザーの入力
    ↓
Claude にメッセージ + ツール一覧を送信
    ↓
Claude が「このツールを使う」と判断 → ToolCall を返す
    ↓
Mastra がツールを実行（= API を叩く）
    ↓
実行結果を Claude に送り返す
    ↓
Claude が結果を解釈して日本語で返答
```

この「モデルがツールを呼ぶ → 結果を受け取る → 返答する」サイクルを **Tool Use（Function Calling）** という。

### `generate` vs `stream`

| メソッド | 動作 |
|---|---|
| `agent.generate(messages)` | 返答が完成してから一括で返す |
| `agent.stream(messages)` | 返答をストリームで少しずつ返す（タイピングアニメーション） |

より UX を良くしたい場合は `stream` を使って逐次表示にする。

---

## 10. よくあるエラーと対処法

| エラー | 原因 | 対処 |
|---|---|---|
| `Anthropic API key not found` | 環境変数未設定 | `.env.local` に `VITE_ANTHROPIC_API_KEY` を追加 |
| ツールが呼ばれない | description が不明確 | ツールの description をより具体的にする |
| 存在しない ID を操作しようとする | AI が ID を推測している | `listTodos` で確認してから操作するよう instructions に追記 |
| `CORS error` from API | Rails サーバーが起動していない | `rails s` で起動を確認 |

---

## チェックリスト

- [ ] `npm install @mastra/core @ai-sdk/anthropic` を実行
- [ ] `src/mastra/tools.ts` を作成（5 つのツール）
- [ ] `src/mastra/agent.ts` を作成
- [ ] `.env.local` に `VITE_ANTHROPIC_API_KEY` を追加
- [ ] `src/components/agent/AgentChat.tsx` を作成
- [ ] `App.tsx` に `<AgentChat onAction={refetch} />` を追加
- [ ] 開発サーバーを起動してチャットから Todo を操作できることを確認
