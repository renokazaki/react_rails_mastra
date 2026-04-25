# Phase 4 実装ガイド — Workflow でレシートを分析・登録する（パイプライン構成）

> **目標**: Mastra の Workflow を使い「分析 → 登録」を1つのパイプラインとして実装する。
> 各ステップの入出力が型安全に連鎖し、Mastra Studio で処理の流れを可視化できる。
> **前提**: Phase 3 (Mastra 導入) が完了していること。Rails 側の準備は
> `guide_phase4_receipt_multiagent.md` のセクション1と共通。

---

## 0. アーキテクチャ概要

```
React UI
  │ 画像アップロード
  ▼
receiptWorkflow
  ├── Step 1: analyzeReceipt  ← receiptAnalyzerAgent で画像→JSON
  │     │ outputSchema で型保証
  ▼     ▼
  └── Step 2: saveReceipt    ← saveReceiptTool で Rails API へ POST
              ▼
        Rails API  POST /api/v1/receipts
              ▼
        receipts テーブル
```

### Workflow を選ぶ利点

| 特徴 | 説明 |
|---|---|
| 処理の可視化 | Mastra Studio でステップごとの入出力・実行時間を確認できる |
| ステップ単位のリトライ | Step 2 が失敗しても Step 1 を再実行せず Step 2 だけリトライできる |
| 型安全な連鎖 | `outputSchema` → 次ステップの `inputSchema` で型が保証される |
| 拡張性 | 「承認ステップ」「カテゴリ分類ステップ」を中間に差し込みやすい |

---

## 1. Rails 側の準備

マルチエージェント構成と共通です。
`guide_phase4_receipt_multiagent.md` のセクション1（1-1〜1-4）を参照してください。

---

## 2. Mastra 側の実装

### 2-1. saveReceiptTool の作成

`frontend/src/mastra/tools/receipt-tool.ts` を新規作成:

```typescript
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const API_BASE = "http://localhost:3000/api/v1";

export const receiptItemSchema = z.object({
  name:     z.string(),
  quantity: z.number(),
  price:    z.number(),
  total:    z.number(),
});

export const receiptDataSchema = z.object({
  storeName:     z.string(),
  items:         z.array(receiptItemSchema),
  subtotal:      z.number(),
  tax:           z.number(),
  total:         z.number(),
  paymentMethod: z.string().optional(),
});

export const saveReceiptTool = createTool({
  id: "saveReceipt",
  description: "分析済みのレシートデータを Rails API に保存する",
  inputSchema: receiptDataSchema,
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
    return res.json() as Promise<{ id: number; store_name: string; total: number }>;
  },
});
```

### 2-2. receiptWorkflow の作成

`frontend/src/mastra/workflows/receipt-workflow.ts` を新規作成:

```typescript
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { mastra } from "../index";
import { receiptDataSchema, saveReceiptTool } from "../tools/receipt-tool";

// Step 1: 画像を分析してJSON抽出
const analyzeReceiptStep = createStep({
  id: "analyzeReceipt",
  description: "レシート画像を分析し構造化JSONを抽出する",
  inputSchema: z.object({
    imageBase64: z.string().describe("Base64エンコードされたレシート画像"),
  }),
  outputSchema: receiptDataSchema,
  execute: async ({ inputData }) => {
    const agent = mastra.getAgent("receipt-analyzer-agent");

    const result = await agent.generate([
      {
        role: "user",
        content: [
          { type: "text",  text: "このレシートを分析してJSON形式で返してください" },
          { type: "image", image: inputData.imageBase64 },
        ],
      },
    ]);

    // LLM の返答からJSONブロックを抽出
    const jsonMatch = result.text.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch) throw new Error("レシートのJSON抽出に失敗しました");

    const parsed = JSON.parse(jsonMatch[1]);

    // スキーマを camelCase に揃える
    return {
      storeName:     parsed.storeName,
      items:         parsed.items,
      subtotal:      parsed.subtotal,
      tax:           parsed.tax,
      total:         parsed.total,
      paymentMethod: parsed.paymentMethod,
    };
  },
});

// Step 2: 抽出したJSONをRails APIに登録
const saveReceiptStep = createStep({
  id: "saveReceipt",
  description: "抽出したレシートデータをRails APIに保存する",
  inputSchema: receiptDataSchema,
  outputSchema: z.object({
    id:         z.number(),
    store_name: z.string(),
    total:      z.number(),
    message:    z.string(),
  }),
  execute: async ({ inputData }) => {
    const saved = await saveReceiptTool.execute(inputData);
    return {
      ...saved,
      message: `「${saved.store_name}」のレシートを登録しました（合計: ${saved.total}円）`,
    };
  },
});

// Workflow 定義
export const receiptWorkflow = createWorkflow({
  id:          "receipt-workflow",
  name:        "Receipt Analyzer & Saver",
  description: "レシート画像を分析してRails APIに登録するパイプライン",
  inputSchema: z.object({
    imageBase64: z.string(),
  }),
})
  .then(analyzeReceiptStep)
  .then(saveReceiptStep)
  .commit();
```

### 2-3. index.ts にワークフローとツールを登録

`frontend/src/mastra/index.ts` に追記:

```typescript
import { receiptWorkflow } from "./workflows/receipt-workflow";

export const mastra = new Mastra({
  workflows: {
    weatherWorkflow,
    receiptWorkflow,   // 追加
  },
  agents: {
    weatherAgent,
    todoAgent,
    receiptAnalyzerAgent,
  },
  // ... 既存の設定
});
```

---

## 3. フロントエンドからの呼び出し方

```typescript
import { mastra } from "@/mastra";

async function analyzeAndSaveReceipt(imageBase64: string) {
  const workflow = mastra.getWorkflow("receipt-workflow");

  // Workflow を実行
  const run = await workflow.createRun();
  const result = await run.start({
    inputData: { imageBase64 },
  });

  if (result.status === "success") {
    // 最終ステップの出力を取得
    const output = result.steps["saveReceipt"].output;
    console.log(output.message); // 「〇〇」のレシートを登録しました
    return output;
  } else {
    // 失敗したステップを特定できる
    const failedStep = Object.entries(result.steps).find(
      ([, step]) => step.status === "failed"
    );
    throw new Error(`Workflow失敗 (step: ${failedStep?.[0]})`);
  }
}
```

---

## 4. ステップ間のデータフロー

```
inputData: { imageBase64: "..." }
        │
        ▼
[analyzeReceiptStep]
  inputSchema  : { imageBase64: string }
  outputSchema : receiptDataSchema
        │ 自動で次ステップの inputData に注入
        ▼
[saveReceiptStep]
  inputSchema  : receiptDataSchema
  outputSchema : { id, store_name, total, message }
        │
        ▼
result.steps["saveReceipt"].output
```

> **型安全の保証**: `outputSchema` と次ステップの `inputSchema` が一致していないと
> `createWorkflow` の時点で TypeScript エラーになる。実行前に型の不整合を検出できる。

---

## 5. Mastra Studio での確認

```bash
cd frontend
npm run mastra:dev  # または npx mastra dev
```

`http://localhost:4111` を開くと:

- **Workflows タブ**: `receipt-workflow` のステップグラフを可視化
- **実行履歴**: 各 Run の入出力・実行時間・エラーを確認
- **ステップ別ログ**: どのステップで失敗したかを詳細確認

---

## 6. 将来の拡張例

Workflow はステップを `.then()` で繋ぐだけで処理を追加できる:

```typescript
export const receiptWorkflow = createWorkflow({ ... })
  .then(analyzeReceiptStep)
  .then(categorizeReceiptStep)   // カテゴリ自動分類ステップを追加
  .then(approvalStep)            // 金額が高い場合に確認を挟むステップ
  .then(saveReceiptStep)
  .commit();
```

---

## 7. ディレクトリ構成（変更後）

```
frontend/src/mastra/
├── agents/
│   ├── receipt-analyzer-agent.ts   # 既存（変更なし）
│   ├── todo-agent.ts
│   └── weather-agent.ts
├── tools/
│   ├── receipt-tool.ts             # 新規（saveReceiptTool + スキーマ定義）
│   ├── todo-tool.ts
│   └── weather-tool.ts
├── workflows/
│   ├── receipt-workflow.ts         # 新規
│   └── weather-workflow.ts
└── index.ts                        # workflows/agents に追加
```

---

## 8. メリット・デメリット

| 観点 | 内容 |
|---|---|
| **メリット** | Mastra Studio でステップごとの実行状態・ログを可視化できる |
| **メリット** | Step 2 失敗時に Step 1 を再実行せずリトライできる |
| **メリット** | `outputSchema` → `inputSchema` の型安全な連鎖でパースミスを防げる |
| **メリット** | 中間ステップ（承認・分類など）を後から差し込みやすい |
| **デメリット** | `createStep` / `createWorkflow` の記述量がマルチエージェント案より多い |
| **デメリット** | Mastra Workflow の API を学ぶコストがある |

---

## 9. チェックリスト

- [ ] Rails 側の準備（`guide_phase4_receipt_multiagent.md` セクション1を参照）
- [ ] `frontend/src/mastra/tools/receipt-tool.ts` を作成
- [ ] `frontend/src/mastra/workflows/receipt-workflow.ts` を作成
- [ ] `frontend/src/mastra/index.ts` に `receiptWorkflow` を追加
- [ ] `npm run mastra:dev` で Mastra Studio を起動
- [ ] Studio の Workflows タブで `receipt-workflow` のグラフを確認
- [ ] フロントから `workflow.createRun()` → `run.start()` で動作確認
