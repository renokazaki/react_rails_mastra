# 作業ログ: Todo Workflow 実装 & AgentChat UI 拡充

- **日付**: 2026-04-25
- **概要**: Workflowパターンによる Todo 自動分解・登録の実装、および AgentChat UI をサブエージェント方式とワークフロー方式の2つを切り替えられる形に拡充した。

---

## 1. 目的・背景

前回のセッションでオーケストレーター＋サブエージェント方式の実装が完了した。
今回はそれをWorkflowパターンで作ると何が変わるかを学習・比較することが目的。
最終的にはチャットUIから両方のパターンを使い分けられるようにしたかった。

---

## 2. 会話の流れ（タイムライン）

1. Workflowパターンで「Todo 分解→登録」を実装する仕様書の作成を依頼
2. `guide_phase4_todo_workflow.md` を作成（オーケストレーター方式との比較表つき）
3. 実装を依頼 → `todo-workflow.ts` を新規作成、`index.ts` に登録
4. Mastra Studio で動作確認 → `todo-decomposer-agent not found` エラー発生
5. `mastra.getAgent()` のキー名の問題を修正
6. AgentChat UI をサブエージェント・Workflow の2モード切り替えに拡充

---

## 3. やったこと（変更内容）

### 変更ファイル一覧

| ファイル | 変更概要 |
|---|---|
| `docs/guide_phase4_todo_workflow.md` | 新規作成: Workflow方式でTodo分解・登録する仕様書 |
| `frontend/src/mastra/workflows/todo-workflow.ts` | 新規作成: 3ステップWorkflow実装 |
| `frontend/src/mastra/index.ts` | `todoWorkflow` をインポート・登録 |
| `frontend/src/components/agent/AgentChat.tsx` | モード切り替えUI・Workflow API呼び出しを追加 |

### 変更の詳細

#### todo-workflow.ts の構成

3つのステップを `.then()` で連鎖させるパイプライン:

```
Step 1: decomposeGoal   ← mastra.getAgent("todoDecomposerAgent") を呼びJSON抽出（LLM使用）
Step 2: registerTodos   ← fetch() で Rails API に1件ずつ POST（LLM不使用）
Step 3: summarize       ← 文字列整形のみ（LLM不使用）
```

各ステップで `inputSchema` / `outputSchema` を定義し、型安全にデータを連鎖させる。
Step 2・3 は LLM を使わないためコストを抑えられる。

#### AgentChat.tsx の拡充

- ヘッダーに `Tabs` コンポーネントでモード切り替えを追加
- モードごとにAPIエンドポイントを分岐:
  - サブエージェント: `POST /agents/todo-orchestrator-agent/generate`
  - ワークフロー: `POST /workflows/todo-workflow/start-async`
- ユーザーメッセージに送信時のモードを `Badge` で表示
- ローディングテキストをモードに応じて切り替え
- `today` を自動で現在日付（`YYYY-MM-DD`）にしてWorkflowに渡す

---

## 4. 詰まったポイント・トラブルシュート

### 問題1: `Agent with name todo-decomposer-agent not found`

- **症状**: Workflow の Step 1 で `mastra.getAgent('todo-decomposer-agent')` がエラー
- **原因**: `mastra.getAgent()` は `Agent` の `id` プロパティではなく、`index.ts` の `agents: { キー名: agent }` で指定したキー名で検索する。`id: "todo-decomposer-agent"` と登録キー `todoDecomposerAgent` が一致していなかった
- **解決策**: `mastra.getAgent('todoDecomposerAgent')` に修正

```typescript
// 誤り（id プロパティを使用）
const agent = mastra?.getAgent('todo-decomposer-agent');

// 正しい（index.ts の登録キー名を使用）
const agent = mastra?.getAgent('todoDecomposerAgent');
```

---

## 5. 学び・気づき

- **`mastra.getAgent()` のキー解決**: `id` プロパティではなく `index.ts` の `agents:` オブジェクトのキー名で解決される。`weather-workflow.ts` が `'weatherAgent'` を使っているのが正しいパターン
- **Workflow と オーケストレーターの使い分け**:
  - 処理順序をコードで確定させたい → Workflow
  - LLMに柔軟に判断させたい・PoC段階 → オーケストレーター
- **LLMコスト**: Workflow方式は分解ステップのみLLMを使い、登録・まとめはコードで処理するため、オーケストレーター方式より呼び出し回数が少ない
- **Workflow の最終出力取得**: `result.result?.message` または `result.steps?.["summarize"]?.output?.message` でフォールバック付きで取得する

---

## 6. 判断・意思決定の記録

| 判断事項 | 選んだ選択肢 | 理由 |
|---|---|---|
| Workflowのステップ数 | 3ステップ（分解・登録・まとめ） | まとめを独立させることで「登録結果の整形」をLLMなしで確定的に処理できる |
| AgentChatの切り替えUI | Tabs コンポーネント（shadcn/ui） | 既存のUIコンポーネントを再利用でき、視覚的に明確に切り替えられる |
| ワークフローAPIエンドポイント | `start-async` | Mastra の Workflow は `/start-async` で非同期実行・結果を同期的に受け取れる |

---

## 7. 残課題・TODO

- [ ] Workflow・オーケストレーター両方の動作確認（Rails サーバー起動済みの環境で）
- [ ] ワークフロー実行中の進捗表示（現状はローディングスピナーのみ）
- [ ] 入力内容によってモードを自動判定する仕組み（「〇〇したい」→Workflow、「タスクAを完了にして」→通常エージェントなど）
- [ ] AgentChat から通常の `todoAgent`（CRUD操作）も呼べるよう3モード化を検討

---

## 8. 参考情報

- Mastra Workflow API: `POST /api/workflows/{workflowId}/start-async`
- Workflow ステップ内でのエージェント呼び出し: `mastra?.getAgent('登録キー名')`
- `weather-workflow.ts` のパターン（`mastra?.getAgent('weatherAgent')`）が正しい実装例
