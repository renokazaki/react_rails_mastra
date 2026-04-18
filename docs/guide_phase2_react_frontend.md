# Phase 2 ハンズオンガイド — React フロントエンドで Todo UI を作る

> **目標**: Vite + React + TypeScript で Todo の CRUD UI を実装し、Rails API と繋げる。
> **前提**: Phase 1 の Rails API が `localhost:3000` で動いている。Node.js 18+ が入っている。

---

## 0. このフェーズで学ぶこと

| テーマ | 実務での位置づけ |
|---|---|
| TypeScript 型定義 | API レスポンスの型安全な扱い方 |
| fetch によるAPIクライアント | axios なし・素の fetch で堅牢なクライアントを書く |
| カスタムフック | ロジックを UI から分離する React の定石 |
| shadcn/ui | 実務でよく使うコンポーネントライブラリの使い方 |
| 楽観的更新 vs 再取得 | UX を損なわない状態管理の選択 |

---

## 1. プロジェクト構成の確認

`frontend/` ディレクトリの全体像:

```
frontend/
├── src/
│   ├── types/
│   │   └── todo.ts          ← ① 型定義（最初に作る）
│   ├── lib/
│   │   └── api.ts           ← ② API クライアント
│   ├── hooks/
│   │   └── useTodos.ts      ← ③ カスタムフック（状態管理）
│   ├── components/
│   │   ├── layout/
│   │   │   └── Header.tsx
│   │   ├── todo/
│   │   │   ├── TodoCard.tsx
│   │   │   ├── TodoList.tsx
│   │   │   ├── TodoFormDialog.tsx
│   │   │   ├── TodoFilters.tsx
│   │   │   └── PriorityBadge.tsx
│   │   └── ui/              ← shadcn が自動生成するコンポーネント
│   └── App.tsx              ← ④ 全体の組み立て
├── .env.local
└── package.json
```

> **設計の原則**: 依存の方向は「UI → Hook → API クライアント → サーバー」の一方向。  
> UI（コンポーネント）がサーバーを直接呼ばないことで、ロジックの再利用・テストが容易になる。

---

## 2. 型定義 — `src/types/todo.ts`

React + TypeScript 開発の鉄則は **「まず型を決める」**。  
Rails API が返す JSON の形をそのまま TypeScript の型として定義する。

```typescript
// src/types/todo.ts

export type Priority = "low" | "medium" | "high";
export type Status = "pending" | "completed";

// Rails API のレスポンスと一致させる
export interface Todo {
  id: number;
  title: string;
  description: string | null;  // null 許容（Rails の text は null になりえる）
  status: Status;
  priority: Priority;
  due_date: string | null;     // "YYYY-MM-DD" 形式の文字列
  created_at: string;
  updated_at: string;
}

// POST /todos のリクエストボディ用
export interface CreateTodoInput {
  title: string;
  description?: string;        // ? = 省略可能
  priority?: Priority;
  due_date?: string;
}

// PATCH /todos/:id のリクエストボディ用（全フィールドが省略可能）
export interface UpdateTodoInput {
  title?: string;
  description?: string;
  status?: Status;
  priority?: Priority;
  due_date?: string;
}

// フィルタ条件（"all" は「絞り込みなし」を表すUI専用値）
export interface TodoFilters {
  status?: Status | "all";
  priority?: Priority | "all";
  q?: string;
}
```

### なぜ型を先に書くか

1. **ドキュメントになる** — Rails の schema.rb と対応させることで、バックエンドとの仕様を明文化できる
2. **コンパイルエラーで間違いを検出** — API の返り値のフィールド名を typo してもすぐ気づける
3. **IDE の補完が効く** — `todo.` と打てば使えるプロパティ一覧が出る

---

## 3. API クライアント — `src/lib/api.ts`

### 3-1. 基本方針

実務では axios や SWR / TanStack Query などのライブラリをよく使うが、まず素の `fetch` で実装することで「ライブラリが何をしてくれているか」が明確になる。

```typescript
// src/lib/api.ts

import type { Todo, CreateTodoInput, UpdateTodoInput, TodoFilters } from "@/types/todo";

// 環境変数から Base URL を取得（.env.local に書く）
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

// --- 共通リクエスト関数 ---
// ジェネリクス <T> でレスポンスの型を呼び出し側から指定できる
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    // Rails の errors 配列、または HTTP ステータスメッセージを throw
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { errors?: string[] }).errors?.join(", ") ?? `HTTP ${res.status}`);
  }

  // DELETE は 204 No Content を返すので body がない
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

// --- エンドポイントごとのメソッド ---
export const todosApi = {
  list(filters?: TodoFilters): Promise<Todo[]> {
    const params = new URLSearchParams();
    if (filters?.status && filters.status !== "all") params.set("status", filters.status);
    if (filters?.priority && filters.priority !== "all") params.set("priority", filters.priority);
    if (filters?.q) params.set("q", filters.q);
    const qs = params.toString();
    return request<Todo[]>(`/todos${qs ? `?${qs}` : ""}`);
  },

  get(id: number): Promise<Todo> {
    return request<Todo>(`/todos/${id}`);
  },

  create(input: CreateTodoInput): Promise<Todo> {
    return request<Todo>("/todos", {
      method: "POST",
      body: JSON.stringify({ todo: input }),  // Rails の strong parameters に合わせた構造
    });
  },

  update(id: number, input: UpdateTodoInput): Promise<Todo> {
    return request<Todo>(`/todos/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ todo: input }),
    });
  },

  delete(id: number): Promise<void> {
    return request<void>(`/todos/${id}`, { method: "DELETE" });
  },
};
```

### 3-2. ポイント: Rails の Strong Parameters に合わせたネスト

Rails 側のコントローラーは以下のように書かれている:
```ruby
params.require(:todo).permit(:title, ...)
```

これは「`todo` キー配下のパラメータしか受け付けない」という意味。  
そのため fetch の body は `{ todo: { title: "..." } }` という形にする必要がある。

```typescript
// NG: Rails が受け取れない
body: JSON.stringify({ title: input.title })

// OK: todo キーでラップ
body: JSON.stringify({ todo: input })
```

---

## 4. カスタムフック — `src/hooks/useTodos.ts`

### 4-1. カスタムフックとは

`useXxx` という命名規則の関数で、`useState` / `useEffect` などの React フックを組み合わせてロジックをカプセル化する。  
**コンポーネントから「何をするか」のロジックを引き剥がす**ことが目的。

```typescript
// src/hooks/useTodos.ts

import { useState, useEffect, useCallback } from "react";
import { todosApi } from "@/lib/api";
import type { Todo, CreateTodoInput, UpdateTodoInput, TodoFilters } from "@/types/todo";

export function useTodos(filters?: TodoFilters) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // useCallback: 関数の参照を安定させ、不要な再レンダリングを防ぐ
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

  // フィルタが変わるたびに再取得
  useEffect(() => {
    void fetch();
  }, [fetch]);

  // --- 楽観的更新 ---
  // サーバーレスポンスを待たずに UI を先に更新し、UX を向上させる
  const createTodo = useCallback(async (input: CreateTodoInput) => {
    const todo = await todosApi.create(input);
    setTodos((prev) => [todo, ...prev]); // 先頭に追加（created_at: desc に合わせる）
    return todo;
  }, []);

  const updateTodo = useCallback(async (id: number, input: UpdateTodoInput) => {
    const todo = await todosApi.update(id, input);
    setTodos((prev) => prev.map((t) => (t.id === id ? todo : t))); // 対象だけ入れ替え
    return todo;
  }, []);

  const deleteTodo = useCallback(async (id: number) => {
    await todosApi.delete(id);
    setTodos((prev) => prev.filter((t) => t.id !== id)); // 対象を除外
  }, []);

  const toggleTodo = useCallback(
    async (id: number, currentStatus: "pending" | "completed") => {
      return updateTodo(id, { status: currentStatus === "pending" ? "completed" : "pending" });
    },
    [updateTodo]
  );

  return { todos, loading, error, refetch: fetch, createTodo, updateTodo, deleteTodo, toggleTodo };
}
```

### 4-2. 楽観的更新 vs 再取得

| 手法 | メリット | デメリット | 使いどころ |
|---|---|---|---|
| **楽観的更新** | 即座に UI が更新されて UX が良い | サーバーエラー時に整合性がずれる | 失敗が稀な操作（Toggle、Delete） |
| **再取得** | サーバーの状態と完全に同期 | ネットワーク往復が発生し遅い | 外部から状態が変わる可能性がある場面 |

このアプリでは createTodo / updateTodo / deleteTodo はすべてサーバーのレスポンスを待ってから `setTodos` を呼んでいるので、「**サーバーの正確な値を使いつつ、成功後は再取得しない**」折衷パターン。

---

## 5. コンポーネント設計

### 5-1. TodoCard — 1件の Todo を表示するカード

コンポーネント設計の重要概念: **Props によるインターフェース設計**

```typescript
// src/components/todo/TodoCard.tsx

interface Props {
  todo: Todo;
  // コールバックで「何が起きたか」を親に通知。実際の処理は親が持つ。
  onToggle: (id: number, status: "pending" | "completed") => Promise<void>;
  onUpdate: (id: number, input: UpdateTodoInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}
```

> **設計の原則**: コンポーネントはデータの表示と UI の制御に専念し、APIの呼び出しは知らなくていい。
> 「削除ボタンが押された」という事実だけを親に伝える。

主な UI 要素:
- `Checkbox` — チェックで完了/未完了のトグル
- `PriorityBadge` — 優先度をバッジで色分け表示
- 編集ボタン → `TodoFormDialog` を開く
- 削除ボタン → `Dialog`（確認モーダル）を開く

### 5-2. TodoFormDialog — 作成・編集を共用するモーダル

```typescript
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  todo?: Todo;          // undefined なら「作成」、値があれば「編集」
  onSubmit: (input: CreateTodoInput | UpdateTodoInput) => Promise<void>;
}
```

`todo` prop の有無で作成/編集を切り替えるパターンは実務でよく使う。  
初期値の設定は `useEffect` で `todo` が変わるたびにフォームをリセットする。

### 5-3. TodoFilters — 検索・フィルタバー

```typescript
interface Props {
  filters: TodoFilters;
  onChange: (filters: TodoFilters) => void;
}
```

フィルタの状態は `App.tsx` が持ち、`TodoFilters` は表示と変更通知だけを担当する。  
これを **「状態の持ち上げ (Lifting State Up)」** という。複数コンポーネントが同じ状態を参照する必要があるとき、共通の親に state を置く。

---

## 6. App.tsx — 全体の組み立て

```typescript
// src/App.tsx (概略)

export default function App() {
  const [filters, setFilters] = useState<Filters>({});
  const [addOpen, setAddOpen] = useState(false);

  // フックから状態と操作を取り出す
  const { todos, loading, error, createTodo, updateTodo, deleteTodo, toggleTodo } = useTodos(filters);

  // エラーハンドリングを追加してトースト通知
  const handleCreate = async (input: CreateTodoInput | UpdateTodoInput) => {
    try {
      await createTodo(input as CreateTodoInput);
      toast.success("Todo を追加しました");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "追加に失敗しました");
      throw e; // Dialog 側でも catch できるよう再 throw
    }
  };

  // ...handleUpdate, handleDelete, handleToggle も同様のパターン

  return (
    <div>
      <Header />
      <main>
        {/* Stats: pending/completed の集計 */}
        {/* TodoFilters: フィルタ UI */}
        {/* Button: 新規追加ダイアログを開く */}
        {/* TodoList: Todo カード一覧 */}
      </main>
      <TodoFormDialog open={addOpen} onOpenChange={setAddOpen} onSubmit={handleCreate} />
      <Toaster richColors position="bottom-right" />
    </div>
  );
}
```

### データフローの全体像

```
App.tsx
  │
  ├─ useTodos(filters)     ← フックがサーバーと状態を管理
  │     └─ todosApi        ← fetch でサーバーと通信
  │
  ├─ TodoFilters           ← filters を変更 → useTodos が再取得
  ├─ TodoList
  │     └─ TodoCard × N    ← onToggle / onUpdate / onDelete をコールバックで受け取る
  │           └─ TodoFormDialog（編集）
  │           └─ Dialog（削除確認）
  └─ TodoFormDialog（新規作成）
```

---

## 7. 環境変数の設定

`frontend/.env.local`:

```
VITE_API_BASE_URL=http://localhost:3000/api/v1
```

> **VITE_ プレフィックスが必要な理由**: Vite はデフォルトで環境変数をブラウザに公開しない。  
> `VITE_` で始まる変数だけが `import.meta.env.VITE_XXX` としてクライアントコードから参照できる。  
> 秘密情報（API キーなど）は `VITE_` を付けずに、サーバーサイドだけで参照する。

---

## 8. 起動して動作確認

```bash
# ターミナル 1: Rails バックエンド
cd backend
rails s -p 3000

# ターミナル 2: React フロントエンド
cd frontend
npm run dev  # → http://localhost:5173
```

### 確認手順

1. ブラウザで `http://localhost:5173` を開く
2. 「新しい Todo を追加」ボタンからTodoを作成
3. チェックボックスで完了/未完了をトグル
4. 鉛筆アイコンで編集、ゴミ箱アイコンで削除
5. フィルタで絞り込み・キーワード検索

### Chrome DevTools で API を確認する

1. **Network タブ** → `todos` のリクエストを選択
2. **Preview タブ** → JSON レスポンスを確認
3. **Headers タブ** → ステータスコード、リクエストメソッドを確認

---

## 9. よくあるエラーと対処法

| エラー | 原因 | 対処 |
|---|---|---|
| `CORS error` | Rails の CORS 設定漏れ | `config/initializers/cors.rb` を確認 |
| `Failed to fetch` | Rails サーバーが起動していない | `rails s` を確認 |
| `422 Unprocessable Entity` | バリデーションエラー | console に出る `errors` 配列を確認 |
| `todo is undefined` | Strong Parameters のネスト忘れ | `{ todo: input }` でラップしているか確認 |
| TypeScript エラー: `Property does not exist` | 型定義と実際の API レスポンスの不一致 | `types/todo.ts` を API の実レスポンスと照合 |

---

## 10. 実務で発展させるなら

### shadcn/ui のインストール（未導入の場合）

```bash
cd frontend
npx shadcn-ui@latest init
npx shadcn-ui@latest add card button input textarea dialog badge checkbox select sheet sonner
```

### TanStack Query（React Query）への移行

素の `useState + useEffect` から TanStack Query へ移行すると:
- キャッシュ管理が自動化される
- `staleTime` / `gcTime` でネットワーク節約
- `useMutation` で楽観的更新がより宣言的に書ける

```typescript
// 現在の useTodos のパターンが理解できれば、TanStack Query への移行も自然に理解できる
const { data: todos, isLoading } = useQuery({
  queryKey: ["todos", filters],
  queryFn: () => todosApi.list(filters),
});
```

### axios への移行

axios を使うと interceptor でエラーハンドリングを一元化できる:

```typescript
// 現在の request() 関数が axios.create() に対応する概念
const apiClient = axios.create({ baseURL: BASE_URL });
apiClient.interceptors.response.use(
  (res) => res,
  (err) => Promise.reject(new Error(err.response?.data?.errors?.join(", ")))
);
```

---

## チェックリスト

- [ ] `src/types/todo.ts` に型定義を作成
- [ ] `src/lib/api.ts` に API クライアントを実装
- [ ] `src/hooks/useTodos.ts` にカスタムフックを実装
- [ ] `TodoCard`, `TodoList`, `TodoFormDialog`, `TodoFilters` を実装
- [ ] `App.tsx` で全体を組み立て
- [ ] `.env.local` に `VITE_API_BASE_URL` を設定
- [ ] Todo の作成・表示・編集・削除が動作することを確認
- [ ] フィルタ・キーワード検索が動作することを確認
- [ ] Chrome DevTools の Network タブで API リクエストを確認
