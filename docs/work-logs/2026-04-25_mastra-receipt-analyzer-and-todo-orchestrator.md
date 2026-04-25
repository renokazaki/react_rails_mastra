# 作業ログ: Mastra エージェント拡張 — レシート分析・登録 & Todoオーケストレーター

- **日付**: 2026-04-25
- **概要**: レシート分析エージェントの出力をRails APIに登録する実装案の設計と仕様書化、および自然言語からTodoを自動分解・登録するオーケストレーターエージェントの設計・実装。

---

## 1. 目的・背景

既存の `receiptAnalyzerAgent`（レシート画像→JSON抽出）と `todoAgent`（Todo CRUD操作）を拡張し、以下2つの機能を追加したかった。

1. **レシート登録機能**: レシート分析結果を Rails API に自動保存する
2. **Todoオーケストレーター**: チャットに「やりたいこと」を書くと、AIがTodoに分解して一括登録する

---

## 2. 会話の流れ（タイムライン）

1. レシート分析結果をAPI登録する実装案の相談
2. 3つの実装案（同一エージェント拡張・マルチエージェント・Workflow）をメリデメ付きで整理
3. マルチエージェント案（案2）とWorkflow案（案3）の両方を仕様書化する方針に決定
4. `docs/guide_phase4_receipt_multiagent.md` と `docs/guide_phase4_receipt_workflow.md` を作成
5. Todoオーケストレーターの要件を整理（自然言語入力→分解→登録）
6. Mastraの `agents:` プロパティでサブエージェントをツール化できることをWeb調査で確認
7. `docs/guide_phase4_todo_orchestrator.md` を仕様書として作成
8. オーケストレーターを実際に実装（2ファイル新規作成 + index.ts修正）
9. 動作確認時、チャットUIが `todo-agent` にハードコードされていたバグを発見・修正

---

## 3. やったこと（変更内容）

### 変更ファイル一覧

| ファイル | 変更概要 |
|---|---|
| `docs/guide_phase4_receipt_multiagent.md` | 新規作成: マルチエージェント構成でレシートを分析・登録する仕様書 |
| `docs/guide_phase4_receipt_workflow.md` | 新規作成: Workflowパイプライン構成でレシートを分析・登録する仕様書 |
| `docs/guide_phase4_todo_orchestrator.md` | 新規作成: オーケストレーターエージェントによるTodo自動分解・登録の仕様書 |
| `frontend/src/mastra/agents/todo-decomposer-agent.ts` | 新規作成: 思考エージェント（目標→Todo JSON分解） |
| `frontend/src/mastra/agents/todo-orchestrator-agent.ts` | 新規作成: オーケストレーターエージェント（分解委譲+登録） |
| `frontend/src/mastra/index.ts` | 2エージェントをインポート・登録 |
| `frontend/src/components/agent/AgentChat.tsx` | 呼び出しエージェントを `todo-orchestrator-agent` に修正 |

### 変更の詳細

#### todo-decomposer-agent.ts（思考エージェント）

`description` を明示的に設定することで、オーケストレーターのLLMが「いつ呼ぶか」を正しく判断できるようにした。
instructionsで「JSON配列のみ返す（前置き不要）」と明示し、パースエラーを防ぐ設計にした。

```typescript
export const todoDecomposerAgent = new Agent({
  id: "todo-decomposer-agent",
  description: "ユーザーのやりたいこと・目標を受け取り、具体的なTodoリストにJSON分解する",
  tools: {},  // ツール不要（LLMのみで思考）
});
```

#### todo-orchestrator-agent.ts（オーケストレーター）

Mastraの `agents:` プロパティにサブエージェントを渡すと、`agent-<key>` というツール名で自動変換される。
`tools: { createTodo }` と組み合わせることで「分解→登録」を1エージェントで制御できる。

```typescript
export const todoOrchestratorAgent = new Agent({
  agents: {
    todoDecomposer: todoDecomposerAgent,  // → "agent-todoDecomposer" ツールとして自動変換
  },
  tools: { createTodo },
});
```

---

## 4. 詰まったポイント・トラブルシュート

### 問題1: チャットUIが常に `todo-agent` を呼んでいた

- **症状**: `todo-orchestrator-agent` を実装したのに、ログに `todoAgent` のsystemInstructionが出力されていた
- **原因**: `AgentChat.tsx:56` のエンドポイントURLに `todo-agent` がハードコードされていた
- **解決策**: `todo-orchestrator-agent` に変更

```typescript
// 修正前
`${MASTRA_API_BASE}/agents/todo-agent/generate`

// 修正後
`${MASTRA_API_BASE}/agents/todo-orchestrator-agent/generate`
```

### 問題2: `ECONNRESET` エラー

- **症状**: `AI_APICallError: Cannot connect to API: read ECONNRESET`
- **原因**: Google Gemini API への一時的なネットワーク接続断（コードの問題ではない）
- **解決策**: 再試行で解消。コード変更不要

---

## 5. 学び・気づき

- **Mastraのサブエージェント化の仕組み**: `Agent` の `agents:` プロパティにエージェントを渡すだけで自動的にツール化される。ツール名は `agent-<key>` の命名規則に従う。明示的な `asTool()` 呼び出しは不要
- **`description` の重要性**: サブエージェントの `description` はオーケストレーターのLLMが委譲判断に使う。具体的で明確な説明を書くほど精度が上がる
- **instructionsでのJSON出力制御**: サブエージェントに「JSON配列のみ返す」と明示しないと、LLMが前置き文を付けてパースエラーを引き起こす
- **ハードコードの罠**: チャットUIのエンドポイントがハードコードされていると、新しいエージェントに切り替えても気づきにくい

---

## 6. 判断・意思決定の記録

| 判断事項 | 選んだ選択肢 | 理由 |
|---|---|---|
| レシート登録の実装案 | マルチエージェント案 + Workflow案の両方を仕様書化 | 両方やりたいという要望のため、どちらも仕様書として残して実装時に選べるようにした |
| サブエージェントへの委譲方式 | `agents:` プロパティを使うMastraネイティブ方式 | `createTool` でエージェントをラップする方式より宣言的で、Mastraの公式パターンに従える |
| TodoDecomposerのtools | 空オブジェクト `{}` | 思考だけすればよいためツール不要。シンプルに保つ |

---

## 7. 残課題・TODO

- [ ] レシート登録機能の実装（`guide_phase4_receipt_multiagent.md` または `guide_phase4_receipt_workflow.md` に従って）
- [ ] AgentChatのエージェント切り替えUI（目的に応じて `todo-agent` と `todo-orchestrator-agent` を使い分けられるようにする）
- [ ] オーケストレーターの動作確認（`ECONNRESET` が解消したら「〇〇したい」系のメッセージで実際に試す）
- [ ] サブエージェントのJSON出力が壊れた場合のリトライロジック（現状はLLM任せ）

---

## 8. 参考情報

- [Supervisor agents | Mastra Docs](https://mastra.ai/docs/agents/supervisor-agents)
- [Agent networks | Mastra Docs](https://mastra.ai/docs/agents/networks)
- [Example: Supervisor Agent | Mastra Docs](https://mastra.ai/examples/agents/supervisor-agent)
- [Multi-agent systems | Mastra Docs](https://mastra.ai/guides/concepts/multi-agent-systems)
- Mastraのサブエージェントツール命名規則: `agents: { key: agent }` → ツール名 `agent-<key>`
