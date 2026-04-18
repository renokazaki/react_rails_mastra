# Phase 3 実装ガイド — Mastra Agent から Rails API を呼ぶ（Custom API Routes 対応）

## 結論

はい、可能です。  
Mastra エージェントは **Tool の `execute()` 内で `fetch`** すれば、Rails の API（例: `http://localhost:3000/api/v1/...`）を直接呼べます。  
さらに `registerApiRoute()` を使うと、Mastra サーバー側に独自エンドポイントを作って、そこで Agent 実行や Rails API 呼び出しを制御できます。

---

## 推奨アーキテクチャ

- Rails: 業務ロジックと永続化を担当（既存 API を維持）
- Mastra: LLM オーケストレーション（Agent/Tool/Workflow）
- React: UI。必要に応じて Mastra API を呼ぶ

```text
React UI
  -> Mastra API (/api/agents/* or /chat/* custom route)
      -> Agent
          -> Tool
              -> Rails API (/api/v1/*)
```

---

## 実装パターン A（基本）: Tool から Rails API を直接呼ぶ

最もシンプルな方法です。  
`frontend/src/mastra/tools/*` の `execute()` で Rails API を呼びます。

```ts
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const RAILS_API_BASE = process.env.RAILS_API_BASE_URL ?? "http://localhost:3000/api/v1";

export const listTodosTool = createTool({
  id: "list-todos",
  description: "Rails API から Todo 一覧を取得する",
  inputSchema: z.object({
    status: z.enum(["pending", "completed"]).optional(),
  }),
  outputSchema: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      status: z.string(),
    })
  ),
  execute: async ({ context }) => {
    const params = new URLSearchParams();
    if (context.status) params.set("status", context.status);

    const res = await fetch(`${RAILS_API_BASE}/todos?${params.toString()}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        // 必要なら Authorization ヘッダを付与
        // Authorization: `Bearer ${process.env.RAILS_API_TOKEN}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Rails API error: ${res.status}`);
    }

    return (await res.json()) as Array<{ id: number; title: string; status: string }>;
  },
});
```

### ポイント

- Tool は「LLM が呼ぶアクション」を表すため、Rails API 連携は Tool 化が最適
- 入出力を `zod` で厳密化して、プロンプト起因の不正データを防ぐ
- 認証がある場合は Tool 側でヘッダを統一注入する

---

## 実装パターン B（拡張）: `registerApiRoute()` で独自ルートを作る

Mastra サーバーに `/chat/...` など独自 API を追加し、  
ルートハンドラの中で Agent を取得・実行できます。

```ts
import { Mastra } from "@mastra/core";
import { registerApiRoute } from "@mastra/core/server";

export const mastra = new Mastra({
  agents: { /* your agents */ },
  server: {
    apiRoutes: [
      registerApiRoute("/chat/weather", {
        method: "POST",
        openapi: {
          summary: "Weather agent chat",
          tags: ["Chat"],
          responses: {
            200: { description: "OK" },
          },
        },
        handler: async c => {
          const body = await c.req.json();
          const mastra = c.get("mastra");
          const agent = mastra.getAgent("weather-agent");

          const result = await agent.generate(body.message);
          return c.json({ text: result.text });
        },
      }),
    ],
  },
});
```

### この方式が有効なケース

- フロント向けの API 契約を Mastra 側で固定したい
- 認可・監査ログ・レート制限を route middleware でまとめたい
- OpenAPI/Swagger で API 仕様を可視化したい

---

## Rails API 連携で実務上ほぼ必須の項目

### 1) 環境変数

`frontend/.env`（Mastra 実行プロセスが参照できる場所）に定義:

```env
GOOGLE_GENERATIVE_AI_API_KEY=xxxx
RAILS_API_BASE_URL=http://localhost:3000/api/v1
RAILS_API_TOKEN=xxxx
```

### 2) CORS

- ブラウザ -> Rails 直叩きなら Rails 側 CORS 設定が必要
- ブラウザ -> Mastra -> Rails の中継なら、Rails の CORS 要件を緩和しやすい

### 3) 認証

- Mastra に auth を設定した場合、custom route はデフォルトで認証必須
- 公開エンドポイント化する場合のみ `requiresAuth: false`

### 4) エラー設計

- Tool 内は `throw new Error("...")` で理由を明確化
- custom route は `c.json({ error: ... }, 4xx/5xx)` を明示

---

## このリポジトリ向けの実装手順（最短）

1. `frontend/src/mastra/tools/` に Rails API 呼び出し用 Tool を追加  
2. 対象 Agent（例: `weather-agent` とは別に `todo-agent`）へ Tool を紐付け  
3. 必要なら `frontend/src/mastra/index.ts` の `server.apiRoutes` に `registerApiRoute()` を追加  
4. `mastra dev` で `/api/openapi.json` と `/swagger-ui` を確認  
5. React 側から custom route を呼び、期待レスポンスを確認

---

## 参考（Mastra 公式機能）

- Custom API Routes: `registerApiRoute(path, options)`
- `c.get("mastra")` で Mastra インスタンスへアクセス
- `middleware` で route 単位の前処理
- `openapi` を付けると Swagger UI に表示
- `requiresAuth: false` で認証除外（auth 設定時のみ意味を持つ）

---

## まとめ

- **質問への回答**: 「Mastra エージェントが Rails API を叩けるか？」→ **叩けます**
- 実装の本命は **Tool で Rails API を呼ぶ** 方式
- API 契約や認証制御を整理したい場合は **`registerApiRoute()` を追加** するのが実践的

