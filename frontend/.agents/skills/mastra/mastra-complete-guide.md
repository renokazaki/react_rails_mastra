# Mastra フレームワーク 完全解説ガイド

> **重要**: MastraのAPIは急速に変化します。コードを書く前に必ず現在のドキュメントを確認してください。

---

## 目次

1. [Mastraとは](#1-mastraとは)
2. [セットアップ方法](#2-セットアップ方法)
3. [コアコンセプト](#3-コアコンセプト)
4. [Agent（エージェント）](#4-agentエージェント)
5. [Workflow（ワークフロー）](#5-workflowワークフロー)
6. [Tool（ツール）](#6-toolツール)
7. [Memory（メモリ）](#7-memoryメモリ)
8. [RAG（検索拡張生成）](#8-rag検索拡張生成)
9. [Storage（ストレージ）](#9-storageストレージ)
10. [Mastra Studio](#10-mastra-studio)
11. [ドキュメントの調べ方](#11-ドキュメントの調べ方)
12. [よくあるエラーと解決策](#12-よくあるエラーと解決策)
13. [バージョンアップ手順](#13-バージョンアップ手順)

---

## 1. Mastraとは

Mastraは**TypeScript製のAIアプリケーションフレームワーク**です。エージェント・ワークフロー・ツール・メモリ・RAGを統一的なAPIで構築できます。

### 主な特徴

| 機能 | 説明 |
|------|------|
| Agent | 自律的にツールを使いながらタスクを実行するAI |
| Workflow | ステップを順番に実行する定義済みパイプライン |
| Tool | エージェントの能力を拡張する関数 |
| Memory | 会話履歴・セマンティック記憶の管理 |
| RAG | ベクターストアを使った外部知識の検索 |
| Studio | ブラウザで動作するインタラクティブなUI |

### 対応モデルプロバイダー

- OpenAI (`openai/gpt-5.4`)
- Anthropic (`anthropic/claude-sonnet-4-5`)
- Google (`google/gemini-2.5-pro`)
- その他多数

---

## 2. セットアップ方法

### 方法A: CLIを使ったクイックセットアップ（推奨）

```bash
npm create mastra@latest
# または
pnpm create mastra@latest
yarn create mastra@latest
bun create mastra@latest
```

**CLIオプション:**

```bash
# サンプルエージェントなしで作成
npm create mastra@latest --no-example

# テンプレートを指定して作成
npm create mastra@latest --template <template-name>
```

### 方法B: 手動インストール（ステップバイステップ）

#### Step 1: プロジェクト作成

```bash
mkdir my-first-agent && cd my-first-agent
npm init -y
```

#### Step 2: 依存関係インストール

```bash
npm install -D typescript @types/node mastra@latest
npm install @mastra/core@latest zod@^4
```

#### Step 3: package.jsonにスクリプト追加

```json
{
  "scripts": {
    "dev": "mastra dev",
    "build": "mastra build"
  }
}
```

#### Step 4: TypeScript設定（重要）

`tsconfig.json` を作成:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

> **必須**: `"module": "ES2022"` と `"moduleResolution": "bundler"` を設定すること。CommonJSは動作しません。

#### Step 5: 環境変数設定

`.env` ファイルを作成:

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_GENERATIVE_AI_API_KEY=...
```

#### Step 6: ファイル構成

```
src/
└── mastra/
    ├── index.ts          # Mastraエントリーポイント
    ├── agents/
    │   └── my-agent.ts
    ├── tools/
    │   └── my-tool.ts
    └── workflows/
        └── my-workflow.ts
```

#### Step 7: Mastraインスタンス作成

`src/mastra/index.ts`:

```typescript
import { Mastra } from "@mastra/core";
import { myAgent } from "./agents/my-agent";

export const mastra = new Mastra({
  agents: { myAgent },
});
```

#### Step 8: 起動

```bash
npm run dev
# http://localhost:4111 でStudioにアクセス
```

---

## 3. コアコンセプト

### Agent vs Workflow の使い分け

| | Agent | Workflow |
|---|---|---|
| **特徴** | 自律的・動的に判断 | 構造的・順番固定 |
| **向いている用途** | 問い合わせ対応・リサーチ・分析 | パイプライン・承認フロー・ETL |
| **ツール使用** | AIが自動で判断して使用 | ステップごとに定義 |
| **予測可能性** | 低い（柔軟） | 高い（確実） |

### モデル指定フォーマット

Mastraでは **`"provider/model-name"`** 形式でモデルを指定します:

```typescript
model: "openai/gpt-5.4"
model: "anthropic/claude-sonnet-4-5"
model: "google/gemini-2.5-pro"
```

> モデル名は頻繁に変わります。使用前に必ずプロバイダーレジストリスクリプトで確認してください。

---

## 4. Agent（エージェント）

エージェントはLLMとツールを組み合わせて自律的にタスクを実行します。

### 基本的なエージェント作成

```typescript
import { Agent } from "@mastra/core/agent";
import { weatherTool } from "../tools/weather-tool";

export const weatherAgent = new Agent({
  id: "weather-agent",
  name: "Weather Agent",
  instructions: `
    あなたは天気情報を提供するアシスタントです。
    weatherToolを使って現在の天気データを取得してください。
    回答は簡潔かつ正確にしてください。
  `,
  model: "google/gemini-2.5-pro",
  tools: { weatherTool },
});
```

### エージェントの実行

```typescript
// 単純な生成
const result = await agent.generate("東京の天気は？");
console.log(result.text);

// スレッドID付き（会話履歴保持）
const result = await agent.generate("東京の天気は？", {
  threadId: "user-123-conversation",
  resourceId: "user-123",
});
```

### エージェントパラメータ

| パラメータ | 型 | 説明 |
|---|---|---|
| `id` | string | エージェントの一意識別子 |
| `name` | string | エージェントの表示名 |
| `instructions` | string | システムプロンプト |
| `model` | string | 使用するモデル（`provider/model`形式） |
| `tools` | object | 使用するツールのマップ |
| `memory` | Memory | メモリインスタンス |

---

## 5. Workflow（ワークフロー）

ワークフローは決まった順番でステップを実行します。

### 基本的なワークフロー作成

```typescript
import { createWorkflow, createStep } from "@mastra/core/workflow";
import { z } from "zod";

// Step 1: データ取得
const fetchDataStep = createStep({
  id: "fetch-data",
  execute: async ({ inputData }) => {
    const data = await fetchSomeData(inputData.query);
    return { data };
  },
});

// Step 2: データ変換
const transformStep = createStep({
  id: "transform",
  execute: async ({ inputData, getStepResult }) => {
    const { data } = getStepResult("fetch-data");
    const transformed = transform(data);
    return { result: transformed };
  },
});

// ワークフロー定義
const myWorkflow = createWorkflow({
  id: "my-workflow",
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ result: z.string() }),
})
  .then(fetchDataStep)
  .then(transformStep)
  .commit(); // 必須！
```

### ワークフロー実行

```typescript
const run = await myWorkflow.createRun();
const result = await run.start({
  inputData: { query: "検索クエリ" },
});
console.log(result.result);
```

### 状態管理

```typescript
const step = createStep({
  id: "counter-step",
  execute: async ({ state, setState }) => {
    // 状態の更新
    await setState({ ...state, counter: (state.counter || 0) + 1 });
    return { count: state.counter };
  },
});
```

### ワークフローの主要メソッド

| メソッド | 説明 |
|---|---|
| `.then(step)` | 次のステップを追加 |
| `.parallel([step1, step2])` | 並列実行 |
| `.branch(condition, ifTrue, ifFalse)` | 条件分岐 |
| `.commit()` | ワークフローを確定（必須） |
| `.createRun()` | 実行インスタンスを作成 |

---

## 6. Tool（ツール）

ツールはエージェントやワークフローが使える関数です。

### 基本的なツール作成

```typescript
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const weatherTool = createTool({
  id: "get-weather",
  description: "指定した場所の現在の天気を取得する",
  inputSchema: z.object({
    location: z.string().describe("都市名"),
  }),
  outputSchema: z.object({
    temperature: z.number(),
    description: z.string(),
  }),
  execute: async ({ location }) => {
    // 実際のAPIコール
    const weather = await fetchWeatherAPI(location);
    return {
      temperature: weather.temp,
      description: weather.description,
    };
  },
});
```

### ツールのパラメータ

| パラメータ | 型 | 説明 |
|---|---|---|
| `id` | string | ツールの一意識別子 |
| `description` | string | ツールの説明（LLMが読む） |
| `inputSchema` | ZodSchema | 入力のバリデーション |
| `outputSchema` | ZodSchema | 出力のバリデーション |
| `execute` | function | 実行する関数 |

### サスペンド（一時停止）機能付きツール

承認フローなど、人間の介入が必要な場合:

```typescript
const approvalTool = createTool({
  id: "approval",
  inputSchema: z.object({ request: z.string() }),
  outputSchema: z.object({ approved: z.boolean() }),
  suspendSchema: z.object({ requestId: z.string() }),
  resumeSchema: z.object({ approved: z.boolean() }),
  execute: async (input, context) => {
    if (!context.resumeData) {
      // 初回呼び出し - サスペンド
      const requestId = generateId();
      context.suspend({ requestId });
      return;
    }
    // 再開後 - resumeDataを使用
    return { approved: context.resumeData.approved };
  },
});

// ワークフローを再開
await run.resume({
  resumeData: { approved: true },
});
```

### Mastraインスタンスへのツール登録

```typescript
const mastra = new Mastra({
  tools: {
    weatherTool,    // エージェントから使えるように登録
    approvalTool,
  },
});
```

---

## 7. Memory（メモリ）

メモリはエージェントの会話履歴や記憶を管理します。

### メモリの種類

| 種類 | 説明 |
|---|---|
| **Message History** | 直近のメッセージ履歴 |
| **Working Memory** | 現在のセッションの作業記憶 |
| **Semantic Recall** | 意味的に類似した過去の記憶 |
| **Observational Memory** | 観察・学習した情報 |

### 基本的なメモリ設定

```typescript
import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";

// ストレージ設定
const storage = new PostgresStore({
  connectionString: process.env.DATABASE_URL,
});

// メモリ作成
const memory = new Memory({
  id: "chat-memory",
  storage,
  options: {
    lastMessages: 10,  // 取得するメッセージ数
  },
});

// エージェントにメモリを割り当て
const agent = new Agent({
  id: "chat-agent",
  memory,
  // ...
});
```

### セマンティック検索付きメモリ

```typescript
const memory = new Memory({
  id: "semantic-memory",
  storage: postgresStore,
  vector: chromaVectorStore,   // ベクターストア（必須）
  embedder: openaiEmbedder,    // 埋め込みモデル（必須）
  options: {
    lastMessages: 10,
    semanticRecall: true,      // セマンティック検索を有効化
  },
});
```

### メモリを使った会話

```typescript
// 一貫したthreadIdを使用することで会話履歴が維持される
await agent.generate("こんにちは", {
  threadId: "user-123-conversation",
  resourceId: "user-123",
});

await agent.generate("昨日の話を覚えていますか？", {
  threadId: "user-123-conversation",  // 同じthreadId
  resourceId: "user-123",
});
```

---

## 8. RAG（検索拡張生成）

RAGは外部のナレッジベースを検索してAIの回答に活用する技術です。

### RAGの仕組み

```
ドキュメント → チャンキング → 埋め込み → ベクターDB保存
                                               ↓
質問 → 埋め込み → 類似検索 → 関連ドキュメント取得 → LLMに渡す
```

### 基本的なRAG設定

```typescript
import { RAG } from "@mastra/rag";

const rag = new RAG({
  vector: chromaVectorStore,
  embedder: openaiEmbedder,
});

// ドキュメントの追加
await rag.addDocuments([
  { content: "Mastraはオープンソースのフレームワークです", metadata: { source: "docs" } },
]);

// 検索
const results = await rag.search("Mastraとは？", { topK: 5 });
```

---

## 9. Storage（ストレージ）

### 対応ストレージ

| パッケージ | 対応DB |
|---|---|
| `@mastra/pg` | PostgreSQL |
| `@mastra/libsql` | LibSQL/SQLite |
| `@mastra/mongodb` | MongoDB |

### PostgreSQLの設定例

```typescript
import { PostgresStore } from "@mastra/pg";

const storage = new PostgresStore({
  connectionString: process.env.DATABASE_URL,
});

// テーブルの初期化
await storage.init();
```

### Dockerでローカルpostgresを起動

```bash
docker run -d \
  --name mastra-postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=mastra \
  -p 5432:5432 \
  postgres:16
```

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/mastra
```

---

## 10. Mastra Studio

Mastra Studioは開発用のインタラクティブUIです。

### 起動方法

```bash
npm run dev
# http://localhost:4111 でアクセス
```

### できること

- エージェントとのチャットテスト
- ワークフローの実行と監視
- ツールのデバッグ
- ログのリアルタイム確認
- メモリの状態確認

---

## 11. ドキュメントの調べ方

### パッケージがインストール済みの場合（推奨）

**埋め込みドキュメントを使う** - インストールされたバージョンと完全に一致:

```bash
# パッケージの確認
ls node_modules/@mastra/

# トピックドキュメントの一覧
ls node_modules/@mastra/core/dist/docs/references/

# 特定のAPIを検索
grep -r "Agent" node_modules/@mastra/core/dist/docs/references

# SOURCE_MAPでファイルパスを確認
cat node_modules/@mastra/core/dist/docs/assets/SOURCE_MAP.json | grep '"Agent"'

# 型定義を読む
cat node_modules/@mastra/core/dist/agent/agent.d.ts
```

### パッケージが未インストールの場合

**リモートドキュメントを使う**:

```
# 全ドキュメントのインデックス
https://mastra.ai/llms.txt

# LLM向けMarkdown形式（URLに.mdをつける）
https://mastra.ai/docs/agents/overview.md
https://mastra.ai/reference/workflows/workflow-methods/then.md
```

### 共通パッケージとドキュメントの場所

| パッケージ | ドキュメントパス | 内容 |
|---|---|---|
| `@mastra/core` | `node_modules/@mastra/core/dist/docs/` | Agent, Workflow, Tool |
| `@mastra/memory` | `node_modules/@mastra/memory/dist/docs/` | メモリシステム |
| `@mastra/rag` | `node_modules/@mastra/rag/dist/docs/` | RAG機能 |
| `@mastra/pg` | `node_modules/@mastra/pg/dist/docs/` | PostgreSQL |
| `@mastra/libsql` | `node_modules/@mastra/libsql/dist/docs/` | LibSQL |

---

## 12. よくあるエラーと解決策

### ビルド・設定エラー

#### `Cannot find module` / `import` エラー

```
Error: Cannot find module '@mastra/core'
SyntaxError: Cannot use import statement outside a module
```

**解決策:**

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler"
  }
}
```

```json
// package.json
{
  "type": "module"
}
```

#### `Property X does not exist on type Y`

**原因**: APIが変更されたのに古いコードを使っている

**解決策:**

```bash
# 現在のAPIを確認
grep -r "AgentConfig" node_modules/@mastra/core/dist/docs/references
npm list @mastra/core
npm update @mastra/core
```

### Agentエラー

#### ツールが使われない

```typescript
// ✅ 正しいパターン
const mastra = new Mastra({
  tools: { weatherTool },  // Mastraインスタンスに登録
});

const agent = new Agent({
  id: "agent",
  tools: { weatherTool },  // エージェントにも割り当て
});
```

#### メモリが永続化されない

```typescript
// ✅ 必ずストレージを設定
const memory = new Memory({
  id: "memory",
  storage: postgresStore,  // 必須
  options: { lastMessages: 10 },
});

// ✅ 一貫したthreadIdを使用
await agent.generate("質問", {
  threadId: "user-123",  // 毎回同じIDを使う
  resourceId: "user-123",
});
```

### Workflowエラー

#### `Cannot read property 'then' of undefined`

**原因**: `.commit()` を呼び忘れている

```typescript
// ✅ 必ず.commit()で締める
const workflow = createWorkflow({ ... })
  .then(step1)
  .then(step2)
  .commit(); // 必須！
```

#### 状態が更新されない

```typescript
// ✅ setState を使う
const step = createStep({
  id: "step",
  execute: async ({ state, setState }) => {
    await setState({ ...state, counter: (state.counter || 0) + 1 });
    return { done: true };
  },
});
```

### Memoryエラー

#### `Storage is required for Memory`

```typescript
// ✅ 必ずstorageを渡す
const memory = new Memory({
  id: "memory",
  storage: postgresStore, // 必須
});
```

#### セマンティック検索が動かない

```typescript
// ✅ vector, embedder, semanticRecall: true がすべて必要
const memory = new Memory({
  storage: postgresStore,
  vector: chromaVectorStore,  // 必須
  embedder: openaiEmbedder,   // 必須
  options: {
    semanticRecall: true,     // 必須
  },
});
```

### Modelエラー

#### `Model not found`

```typescript
// ❌ 間違い
model: "gpt-5.4"

// ✅ 正しい（provider/model形式）
model: "openai/gpt-5.4"
model: "anthropic/claude-sonnet-4-5"
model: "google/gemini-2.5-pro"
```

### デバッグのコツ

```typescript
// 詳細ログの有効化
const mastra = new Mastra({
  logger: new PinoLogger({
    name: "mastra",
    level: "debug",
  }),
});
```

```bash
# パッケージバージョン確認
npm list @mastra/core
npm list @mastra/memory

# TypeScript設定確認
npx tsc --showConfig
```

---

## 13. バージョンアップ手順

### マイグレーション前チェックリスト

- [ ] `git commit` でコードをバックアップ
- [ ] 現在のバージョン確認: `npm list @mastra/core`
- [ ] 公式マイグレーションガイドを確認: `https://mastra.ai/llms.txt`
- [ ] テストがすべて通っていることを確認

### アップグレード手順

```bash
# 1. 現在のバージョン確認
npm list @mastra/core

# 2. 全パッケージを一緒にアップデート（バラバラにしない）
npm install @mastra/core@latest @mastra/memory@latest @mastra/rag@latest mastra@latest

# 3. 自動マイグレーションツールを実行（利用可能な場合）
npx @mastra/codemod@latest v1

# 4. TypeScriptのコンパイル確認
npx tsc --noEmit

# 5. テスト実行
npm test

# 6. Studioで動作確認
npm run dev
```

### アップグレード後チェックリスト

- [ ] 全依存パッケージが同じバージョンに統一されている
- [ ] `npx tsc --noEmit` でエラーなし
- [ ] テストが通る
- [ ] `npm run dev` でStudioが起動する
- [ ] コンソールに警告がない

### Breaking Changesへの対応

```bash
# 旧APIを探す
grep -r "oldApiName" src/

# 新APIを確認
cat node_modules/@mastra/core/dist/docs/assets/SOURCE_MAP.json | grep '"NewApiName"'
cat node_modules/@mastra/core/dist/[path-from-source-map]
```

---

## 開発ワークフロー（まとめ）

```
1. ls node_modules/@mastra/          # パッケージ確認
        ↓ インストール済み                ↓ 未インストール
2a. grep -r "API" node_modules/...   2b. WebFetch https://mastra.ai/llms.txt
        ↓
3. 現在のAPIに基づいてコードを書く
        ↓
4. npm run dev → http://localhost:4111 でテスト
```

---

## 参考リソース

| リソース | URL |
|---|---|
| 公式ドキュメント | https://mastra.ai/docs |
| GitHub | https://github.com/mastra-ai/mastra |
| Discord | https://discord.gg/BTYqqHKUrf |
| Issues | https://github.com/mastra-ai/mastra/issues |
| llms.txt（AIエージェント用ドキュメントインデックス） | https://mastra.ai/llms.txt |
