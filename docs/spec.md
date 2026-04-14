# Todo アプリケーション 仕様書

## 1. プロジェクト概要

### 目的
- Rails API モードの練習
- Mastra を使った AI エージェント導入の練習
- React + Rails + AI の組み合わせ開発の練習

### 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | React (Vite) + TypeScript |
| UI | shadcn/ui + Tailwind CSS |
| バックエンド | Ruby on Rails (API モード) |
| AI エージェント | Mastra |
| DB | SQLite (開発) / PostgreSQL (本番想定) |
| API 通信 | REST API (JSON) |

---

## 2. ディレクトリ構成

```
react_rails/
├── frontend/          # React アプリ (Vite + TypeScript)
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/            # shadcn コンポーネント
│   │   │   ├── todo/          # Todo 関連コンポーネント
│   │   │   └── agent/         # AI エージェント UI
│   │   ├── hooks/             # カスタムフック
│   │   ├── lib/               # API クライアント・ユーティリティ
│   │   ├── mastra/            # Mastra エージェント設定
│   │   └── types/             # TypeScript 型定義
│   └── package.json
│
├── backend/           # Rails API
│   ├── app/
│   │   ├── controllers/
│   │   │   └── api/
│   │   │       └── v1/
│   │   │           └── todos_controller.rb
│   │   └── models/
│   │       └── todo.rb
│   └── Gemfile
│
└── docs/              # ドキュメント
    └── spec.md
```

---

## 3. 機能仕様

### 3.1 Todo 基本機能 (CRUD)

| # | 機能 | 説明 |
|---|---|---|
| 1 | Todo 作成 | タイトル・説明・優先度を入力して作成 |
| 2 | Todo 一覧表示 | 全 Todo をカード形式で表示 |
| 3 | Todo 編集 | タイトル・説明・優先度・ステータスを編集 |
| 4 | Todo 削除 | 確認ダイアログ付きで削除 |
| 5 | 完了/未完了トグル | チェックボックスで即時切り替え |

### 3.2 Todo フィルタ・ソート

| # | 機能 | 説明 |
|---|---|---|
| 1 | ステータスフィルタ | 全て / 未完了 / 完了 で絞り込み |
| 2 | 優先度フィルタ | 高 / 中 / 低 で絞り込み |
| 3 | キーワード検索 | タイトル・説明でリアルタイム検索 |

### 3.3 AI エージェント機能 (Mastra)

チャット UI からテキストで操作できる AI エージェントを導入する。

#### エージェントが実行できるアクション

| アクション | 例 |
|---|---|
| Todo 作成 | 「明日の会議の準備をするタスクを追加して」 |
| Todo 完了 | 「買い物タスクを完了にして」 |
| Todo 削除 | 「古いタスクを全部削除して」 |
| Todo 検索・要約 | 「今日やるべきことを教えて」 |
| 優先度変更 | 「会議準備の優先度を高にして」 |

#### エージェント実装方針
- Mastra の `Agent` + `Tool` を使用
- Tools は Rails API を呼び出す形で実装
- フロントエンド側で Mastra を動作させる（クライアントサイド or Next.js API Route 相当の仕組みを検討）

---

## 4. データモデル

### todos テーブル

| カラム名 | 型 | 必須 | 説明 |
|---|---|---|---|
| id | integer | ✓ | PK (自動採番) |
| title | string | ✓ | タイトル (最大100文字) |
| description | text | - | 詳細説明 |
| status | string | ✓ | `pending` / `completed` (default: `pending`) |
| priority | string | ✓ | `low` / `medium` / `high` (default: `medium`) |
| due_date | date | - | 期限日 |
| created_at | datetime | ✓ | 作成日時 |
| updated_at | datetime | ✓ | 更新日時 |

---

## 5. API 仕様

### Base URL
```
http://localhost:3000/api/v1
```

### エンドポイント一覧

| Method | Path | 説明 |
|---|---|---|
| GET | `/todos` | Todo 一覧取得 |
| POST | `/todos` | Todo 作成 |
| GET | `/todos/:id` | Todo 詳細取得 |
| PATCH/PUT | `/todos/:id` | Todo 更新 |
| DELETE | `/todos/:id` | Todo 削除 |

### レスポンス形式 (共通)

```json
// 成功: 200 / 201
{
  "id": 1,
  "title": "買い物",
  "description": "牛乳・卵・パンを買う",
  "status": "pending",
  "priority": "medium",
  "due_date": "2026-04-20",
  "created_at": "2026-04-14T00:00:00Z",
  "updated_at": "2026-04-14T00:00:00Z"
}

// エラー: 422
{
  "errors": ["Title can't be blank"]
}
```

### GET /todos クエリパラメータ

| パラメータ | 型 | 説明 |
|---|---|---|
| status | string | `pending` / `completed` でフィルタ |
| priority | string | `low` / `medium` / `high` でフィルタ |
| q | string | タイトル・説明のキーワード検索 |

---

## 6. UI 仕様

### 画面構成

```
+--------------------------------------------------+
|  ヘッダー (アプリ名 + ナビ)                        |
+--------------------------------------------------+
|  [検索バー]  [ステータスフィルタ]  [優先度フィルタ] |
+--------------------------------------------------+
|  [+ 新規 Todo 追加]                               |
+--------------------------------------------------+
|  Todo カード (リスト)                             |
|  ┌────────────────────────────────────────────┐ |
|  │ [✓] タイトル          [優先度バッジ] […] │ |
|  │ 説明テキスト...                期限: 4/20  │ |
|  └────────────────────────────────────────────┘ |
+--------------------------------------------------+
|  AI エージェント チャット (画面右下 or 下部パネル) |
|  ┌────────────────────────────────────────────┐ |
|  │ AI: 何かお手伝いできますか？                │ |
|  │ User: 買い物タスクを完了にして              │ |
|  │ AI: 「買い物」を完了に更新しました ✓       │ |
|  └────────────────────────────────────────────┘ |
+--------------------------------------------------+
```

### shadcn/ui 使用コンポーネント

| コンポーネント | 用途 |
|---|---|
| Card | Todo カード |
| Button | 各種ボタン |
| Input / Textarea | フォーム入力 |
| Dialog | 作成・編集モーダル |
| Badge | 優先度・ステータス表示 |
| Checkbox | 完了トグル |
| Select | フィルタ選択 |
| Sheet | AI チャットパネル (サイドドロワー) |
| Tooltip | 操作ヒント |
| Sonner (toast) | 操作完了通知 |

---

## 7. Mastra エージェント設計

### ツール定義

```typescript
// tools/todoTools.ts

// createTodo: タイトル・説明・優先度・期限を受け取り POST /todos
// updateTodo: id + 更新フィールドを受け取り PATCH /todos/:id
// deleteTodo: id を受け取り DELETE /todos/:id
// listTodos: フィルタ条件を受け取り GET /todos
// completeTodo: id を受け取りステータスを completed に更新
```

### エージェント設定

```typescript
// mastra/agent.ts
const todoAgent = new Agent({
  name: "Todo Assistant",
  instructions: `
    あなたは Todo アプリのアシスタントです。
    ユーザーの自然言語の指示を理解し、適切なツールを使って
    Todo の作成・更新・削除・検索を行います。
    操作後は日本語で結果を報告してください。
  `,
  model: anthropic("claude-sonnet-4-6"),
  tools: { createTodo, updateTodo, deleteTodo, listTodos, completeTodo },
});
```

---

## 8. 開発手順

### Phase 1: Rails API 構築
1. `rails new backend --api --database=sqlite3`
2. Todo モデル・マイグレーション作成
3. `api/v1/todos_controller` 実装 (CRUD)
4. CORS 設定 (rack-cors)
5. API 動作確認 (curl / Postman)

### Phase 2: React フロントエンド構築
1. Vite + React + TypeScript セットアップ
2. shadcn/ui 導入・テーマ設定
3. API クライアント実装 (fetch / axios)
4. Todo CRUD UI 実装
5. フィルタ・検索機能実装

### Phase 3: Mastra AI エージェント導入
1. Mastra インストール・初期設定
2. Todo ツール実装 (API 呼び出し)
3. エージェント設定 (Claude モデル使用)
4. チャット UI 実装 (Sheet コンポーネント)
5. エージェントと UI の状態同期 (操作後に Todo リストを再取得)

---

## 9. 開発環境

### 起動方法 (予定)

```bash
# バックエンド
cd backend
bundle install
rails db:create db:migrate
rails s -p 3000

# フロントエンド
cd frontend
npm install
npm run dev  # -> http://localhost:5173
```

### 環境変数 (frontend/.env.local)

```
VITE_API_BASE_URL=http://localhost:3000/api/v1
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

---

## 10. 今後の拡張候補 (スコープ外)

- ユーザー認証 (Devise / JWT)
- タグ・カテゴリ機能
- ドラッグ&ドロップ並び替え
- 期限通知
- AI による自動優先度提案
