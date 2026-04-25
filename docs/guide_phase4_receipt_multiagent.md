# Phase 4 実装ガイド — マルチエージェント構成でレシートを分析・登録する

> **目標**: `receiptAnalyzerAgent`（分析）と `receiptRegistrationAgent`（登録）を分離し、
> 分析エージェントの出力を登録エージェントへ渡して Rails API に保存する。
> **前提**: Phase 3 (Mastra 導入) が完了していること。

---

## 0. アーキテクチャ概要

```
React UI
  │ 画像アップロード
  ▼
receiptAnalyzerAgent        ← 画像からJSON抽出（既存）
  │ generate() で呼び出し
  │ 構造化JSONを返す
  ▼
receiptRegistrationAgent    ← JSONを受け取りAPI登録（新規）
  │ saveReceiptTool
  ▼
Rails API  POST /api/v1/receipts
  ▼
receipts テーブル（新規作成）
```

### エージェント分離の考え方

| エージェント | 責務 | tools |
|---|---|---|
| `receiptAnalyzerAgent` | 画像 → 構造化JSON | なし（LLM のみ） |
| `receiptRegistrationAgent` | JSON → Rails API 登録 | `saveReceiptTool` |

---

## 1. Rails 側の準備

### 1-1. マイグレーションの作成

```bash
cd backend
bin/rails generate migration CreateReceipts
```

`backend/db/migrate/YYYYMMDDXXXXXX_create_receipts.rb` を編集:

```ruby
class CreateReceipts < ActiveRecord::Migration[8.1]
  def change
    create_table :receipts do |t|
      t.string  :store_name,      null: false
      t.integer :subtotal,        null: false
      t.integer :tax,             null: false
      t.integer :total,           null: false
      t.string  :payment_method
      t.json    :items,           null: false, default: []
      t.timestamps
    end
  end
end
```

```bash
bin/rails db:migrate
```

### 1-2. モデルの作成

`backend/app/models/receipt.rb`:

```ruby
class Receipt < ApplicationRecord
  validates :store_name, presence: true
  validates :subtotal, presence: true, numericality: { only_integer: true }
  validates :tax,      presence: true, numericality: { only_integer: true }
  validates :total,    presence: true, numericality: { only_integer: true }
end
```

### 1-3. コントローラの作成

`backend/app/controllers/api/v1/receipts_controller.rb`:

```ruby
module Api
  module V1
    class ReceiptsController < ApplicationController
      def index
        receipts = Receipt.order(created_at: :desc)
        render json: receipts
      end

      def create
        receipt = Receipt.new(receipt_params)
        if receipt.save
          render json: receipt, status: :created
        else
          render json: { errors: receipt.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def show
        receipt = Receipt.find(params[:id])
        render json: receipt
      end

      private

      def receipt_params
        params.require(:receipt).permit(
          :store_name, :subtotal, :tax, :total, :payment_method,
          items: [:name, :quantity, :price, :total]
        )
      end
    end
  end
end
```

### 1-4. ルーティングの追加

`backend/config/routes.rb`:

```ruby
Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      resources :todos
      resources :receipts, only: [:index, :create, :show]  # 追加
    end
  end
end
```

---

## 2. Mastra 側の実装

### 2-1. saveReceiptTool の作成

`frontend/src/mastra/tools/receipt-tool.ts` を新規作成:

```typescript
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const API_BASE = "http://localhost:3000/api/v1";

const receiptItemSchema = z.object({
  name:     z.string(),
  quantity: z.number(),
  price:    z.number(),
  total:    z.number(),
});

export const saveReceiptTool = createTool({
  id: "saveReceipt",
  description: "分析済みのレシートデータを Rails API に保存する",
  inputSchema: z.object({
    storeName:     z.string().describe("店舗名"),
    items:         z.array(receiptItemSchema).describe("購入商品の配列"),
    subtotal:      z.number().describe("小計（税抜き）"),
    tax:           z.number().describe("消費税額"),
    total:         z.number().describe("合計金額（税込み）"),
    paymentMethod: z.string().optional().describe("支払い方法"),
  }),
  execute: async (inputData) => {
    const res = await fetch(`${API_BASE}/receipts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receipt: {
          store_name:     inputData.storeName,
          items:          inputData.items,
          subtotal:       inputData.subtotal,
          tax:            inputData.tax,
          total:          inputData.total,
          payment_method: inputData.paymentMethod,
        },
      }),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },
});
```

### 2-2. receiptRegistrationAgent の作成

`frontend/src/mastra/agents/receipt-registration-agent.ts` を新規作成:

```typescript
import { Agent } from "@mastra/core/agent";
import { saveReceiptTool } from "../tools/receipt-tool";

export const receiptRegistrationAgent = new Agent({
  id: "receipt-registration-agent",
  name: "Receipt Registration Agent",
  instructions: `
あなたはレシートデータを受け取り、Rails API に登録する専門家です。

受け取ったデータを saveReceipt ツールを使って必ず登録してください。

【注意事項】
- 金額は必ず数値型で渡してください
- items は配列形式を維持してください
- 登録完了後は「登録が完了しました」と日本語で報告してください
- 登録失敗時はエラー内容を日本語で報告してください
  `,
  model: "google/gemini-2.5-flash",
  tools: { saveReceiptTool },
});
```

### 2-3. index.ts にエージェントを登録

`frontend/src/mastra/index.ts` の agents に追加:

```typescript
import { receiptRegistrationAgent } from "./agents/receipt-registration-agent";

export const mastra = new Mastra({
  agents: {
    weatherAgent,
    todoAgent,
    receiptAnalyzerAgent,
    receiptRegistrationAgent,  // 追加
  },
  // ... 既存の設定
});
```

---

## 3. フロントエンドからの呼び出し方

### 2エージェントを順番に呼ぶパターン

```typescript
import { mastra } from "@/mastra";

async function analyzeAndSaveReceipt(imageBase64: string) {
  // Step 1: 画像を分析エージェントに渡す
  const analyzeResult = await mastra.getAgent("receipt-analyzer-agent").generate([
    {
      role: "user",
      content: [
        { type: "text", text: "このレシートを分析してください" },
        { type: "image", image: imageBase64 },
      ],
    },
  ]);

  // Step 2: 分析結果を登録エージェントに渡す
  const saveResult = await mastra.getAgent("receipt-registration-agent").generate([
    {
      role: "user",
      content: `以下のレシートデータを登録してください:\n${analyzeResult.text}`,
    },
  ]);

  return saveResult.text;
}
```

---

## 4. ディレクトリ構成（変更後）

```
frontend/src/mastra/
├── agents/
│   ├── receipt-analyzer-agent.ts      # 既存（変更なし）
│   ├── receipt-registration-agent.ts  # 新規
│   ├── todo-agent.ts
│   └── weather-agent.ts
├── tools/
│   ├── receipt-tool.ts                # 新規
│   ├── todo-tool.ts
│   └── weather-tool.ts
└── index.ts                           # agents に追加
```

---

## 5. メリット・デメリット

| 観点 | 内容 |
|---|---|
| **メリット** | 各エージェントの責務が明確（分析・登録を独立してテスト可能） |
| **メリット** | 登録エージェントを他のユースケース（CSV入力など）でも再利用できる |
| **メリット** | 分析だけして確認を挟む「承認フロー」を後から追加しやすい |
| **デメリット** | LLM を2回呼ぶためコスト・レイテンシが増える |
| **デメリット** | 分析結果のJSONをテキストとして受け渡すため、パースミスのリスクがある |

> **JSONパースミス対策**: `analyzeResult.text` をそのまま渡すのではなく、
> フロント側でパースして型チェックしてから登録エージェントに渡すと安全。

---

## 6. チェックリスト

- [ ] `bin/rails generate migration CreateReceipts` でマイグレーション作成
- [ ] `backend/app/models/receipt.rb` を作成
- [ ] `backend/app/controllers/api/v1/receipts_controller.rb` を作成
- [ ] `backend/config/routes.rb` に `resources :receipts` を追加
- [ ] `bin/rails db:migrate` を実行
- [ ] `frontend/src/mastra/tools/receipt-tool.ts` を作成
- [ ] `frontend/src/mastra/agents/receipt-registration-agent.ts` を作成
- [ ] `frontend/src/mastra/index.ts` に `receiptRegistrationAgent` を追加
- [ ] フロントから2エージェントを順番に呼び出して動作確認
