# Phase 2 Rails バックエンド拡充ガイド

> **目標**: 実務レベルの Rails API に進化させる。
> **前提**: Phase 1 の CRUD API が動いている状態（`Todo` モデル・`todos_controller` 実装済み）

---

## 📚 学習ロードマップ

```
┌─────────────────────────────────────────────────────────────────┐
│                   Rails バックエンド拡充 全体像                    │
├──────────┬──────────┬──────────┬──────────┬────────────────────┤
│  Ch.1    │  Ch.2    │  Ch.3    │  Ch.4    │  Ch.5              │
│          │          │          │          │                    │
│シリアライザ│  エラー  │  RSpec  │   JWT    │ Service Object     │
│ レスポンス│ハンドリング│  テスト  │  認証    │ Concern            │
│ 制御      │          │          │          │                    │
│ ★★☆☆   │ ★★☆☆  │ ★★★☆  │ ★★★★  │ ★★★☆             │
└──────────┴──────────┴──────────┴──────────┴────────────────────┘
  └─ まずここ ─┘└── 次にここ ──┘└─── その次 ───┘└── 最後に ──────┘
```

---

# Chapter 1 — シリアライザーでレスポンスを制御する

## 🎯 何を学ぶか

`render json: todo` だと Rails がモデルの全カラムをそのまま返す。  
実務では **「返すフィールドを明示的に選ぶ」「関連モデルをネストして返す」** ことが必須。  
それを担うのが **シリアライザー** という概念。

---

## 1-1. 現在の問題点

```
現在の todos_controller.rb
┌────────────────────────────────────┐
│ render json: todo                  │
│                                    │
│ → DBの全カラムがそのまま出てしまう  │
│ → 不要なフィールドも含まれる        │
│ → 将来 password_digest が入ったら？│
└────────────────────────────────────┘
```

実際に返ってくるJSON（現在）:
```json
{
  "id": 1,
  "title": "買い物",
  "description": "牛乳を買う",
  "status": "pending",
  "priority": "medium",
  "due_date": null,
  "created_at": "2026-04-14T00:00:00.000Z",
  "updated_at": "2026-04-14T00:00:00.000Z"
}
```

---

## 1-2. シリアライザーとは

```
┌──────────────────────────────────────────────────────────────────┐
│                    シリアライザーの役割                            │
│                                                                  │
│  DB (Todo モデル)          シリアライザー        JSON レスポンス  │
│                                                                  │
│  ┌──────────────┐         ┌──────────────┐    ┌─────────────┐  │
│  │ id           │ ──────▶ │ id           │───▶│ "id": 1     │  │
│  │ title        │ ──────▶ │ title        │───▶│ "title":... │  │
│  │ description  │ ──────▶ │ description  │───▶│ ...         │  │
│  │ status       │ ──────▶ │ status_label │───▶│ "status_    │  │
│  │ priority     │         │ (変換あり)    │    │  label":    │  │
│  │ created_at   │   ✗除外 │              │    │  "未完了"   │  │
│  │ updated_at   │   ✗除外 │              │    └─────────────┘  │
│  └──────────────┘         └──────────────┘                     │
│                                                                  │
│  ポイント: 何を返すか・どう変換するかを「シリアライザー」に集約  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 1-3. gem のインストール

`jsonapi-serializer` を使う。軽量で設定が直感的。

```ruby
# Gemfile に追加
gem "jsonapi-serializer"
```

```bash
cd backend
bundle install
```

---

## 1-4. シリアライザーを作る

```bash
# ディレクトリ作成
mkdir -p app/serializers
```

`app/serializers/todo_serializer.rb` を作成:

```ruby
class TodoSerializer
  include JSONAPI::Serializer

  # 返したいフィールドを明示的に列挙する
  attributes :id, :title, :description, :status, :priority, :due_date, :created_at

  # ── カスタム属性: 値を変換して返す ──────────────────────────────
  # status を日本語ラベルに変換（フロントエンドで使いやすく）
  attribute :status_label do |todo|
    todo.status == "completed" ? "完了" : "未完了"
  end

  # priority を日本語に変換
  attribute :priority_label do |todo|
    { "high" => "高", "medium" => "中", "low" => "低" }[todo.priority]
  end

  # due_date を "2026年4月20日" 形式に変換
  attribute :due_date_formatted do |todo|
    todo.due_date&.strftime("%Y年%-m月%-d日")
  end
end
```

---

## 1-5. コントローラーを更新する

`app/controllers/api/v1/todos_controller.rb`:

```ruby
# GET /api/v1/todos
def index
  todos = Todo.all
  todos = todos.where(status: params[:status])     if params[:status].present?
  todos = todos.where(priority: params[:priority]) if params[:priority].present?
  if params[:q].present?
    q = "%#{params[:q]}%"
    todos = todos.where("title LIKE ? OR description LIKE ?", q, q)
  end

  # ✅ 変更: render json: todos の代わりにシリアライザーを使う
  render json: TodoSerializer.new(todos.order(created_at: :desc)).serializable_hash
end

# GET /api/v1/todos/:id
def show
  todo = Todo.find(params[:id])
  # ✅ 1件の場合も同じ書き方
  render json: TodoSerializer.new(todo).serializable_hash
rescue ActiveRecord::RecordNotFound
  render json: { error: "Not found" }, status: :not_found
end

# POST /api/v1/todos
def create
  todo = Todo.new(todo_params)
  if todo.save
    render json: TodoSerializer.new(todo).serializable_hash, status: :created
  else
    render json: { errors: todo.errors.full_messages }, status: :unprocessable_entity
  end
end
```

---

## 1-6. レスポンスの変化を確認

```bash
curl http://localhost:3000/api/v1/todos/1
```

```json
{
  "data": {
    "id": "1",
    "type": "todo",
    "attributes": {
      "id": 1,
      "title": "買い物",
      "description": "牛乳を買う",
      "status": "pending",
      "priority": "medium",
      "due_date": null,
      "created_at": "2026-04-14T00:00:00.000Z",
      "status_label": "未完了",
      "priority_label": "中",
      "due_date_formatted": null
    }
  }
}
```

> **JSONAPI 形式とは**: `data.attributes` の下にフィールドが入る標準仕様。
> フロントエンドは `response.data.attributes.title` でアクセスする。
> フラットな形式が好みなら `.serializable_hash[:data][:attributes]` で取り出して返すことも可能。

---

## 1-7. ✅ チェックリスト

- [ ] `gem "jsonapi-serializer"` を Gemfile に追加して `bundle install`
- [ ] `app/serializers/todo_serializer.rb` を作成
- [ ] `attributes` で返すフィールドを明示
- [ ] `attribute` ブロックでカスタム変換を追加
- [ ] コントローラーの `render json:` をシリアライザー経由に変更
- [ ] curl でレスポンスが `data.attributes` 形式になることを確認

---
---

# Chapter 2 — エラーハンドリングを一元化する

## 🎯 何を学ぶか

現在のコードは各アクションに `rescue ActiveRecord::RecordNotFound` が重複している。  
実務では **エラーハンドリングを一箇所に集約** し、DRY（Don't Repeat Yourself）にする。

---

## 2-1. 現在の問題点

```
現在のコントローラー (todos_controller.rb)

  def show
    todo = Todo.find(params[:id])
    ...
  rescue ActiveRecord::RecordNotFound  ← ❌ 同じコードが
    render json: { error: "Not found" }, status: :not_found
  end

  def update
    todo = Todo.find(params[:id])
    ...
  rescue ActiveRecord::RecordNotFound  ← ❌ 全アクションで繰り返し
    render json: { error: "Not found" }, status: :not_found
  end

  def destroy
    todo = Todo.find(params[:id])
    ...
  rescue ActiveRecord::RecordNotFound  ← ❌ 合計3か所！
    render json: { error: "Not found" }, status: :not_found
  end
```

---

## 2-2. rescue_from で集約する

```
┌─────────────────────────────────────────────────────────────────┐
│                rescue_from の仕組み                              │
│                                                                 │
│  リクエスト                                                      │
│     │                                                           │
│     ▼                                                           │
│  ApplicationController                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  rescue_from ActiveRecord::RecordNotFound → handle_404  │   │
│  │  rescue_from ActionController::ParameterMissing → ...   │   │
│  └─────────────────────────────────────────────────────────┘   │
│     │                                                           │
│     ▼ 例外が発生                                                │
│  TodosController                                                │
│  ┌──────────────────────────┐                                  │
│  │  def show                │                                  │
│  │    Todo.find(999) ──────────▶ RecordNotFound 発生           │
│  │  end                     │    ↓ ApplicationController の    │
│  └──────────────────────────┘    rescue_from が捕まえる        │
│                                                                 │
│  → 各アクションに rescue 不要！                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2-3. Concern でエラーハンドリングをモジュール化する

`app/controllers/concerns/error_handleable.rb` を作成:

```ruby
module ErrorHandleable
  extend ActiveSupport::Concern

  included do
    # ─── よくある例外とHTTPステータスのマッピング ────────────────

    # 404: レコードが見つからない
    rescue_from ActiveRecord::RecordNotFound do |e|
      render_error(:not_found, "リソースが見つかりません", e.message)
    end

    # 422: Strong Parameters の必須キーが欠けている
    rescue_from ActionController::ParameterMissing do |e|
      render_error(:unprocessable_entity, "パラメータが不正です", e.message)
    end

    # 400: JSON のパースに失敗した場合
    rescue_from ActionDispatch::Http::Parameters::ParseError do |_e|
      render_error(:bad_request, "不正なJSONです")
    end
  end

  private

  # ── 統一されたエラーレスポンス形式 ──────────────────────────────
  def render_error(status, message, detail = nil)
    payload = { error: message }
    payload[:detail] = detail if detail.present? && Rails.env.development?
    render json: payload, status: status
  end
end
```

> **Concern とは**: Rails の仕組みで、複数のクラスに共通のロジックをミックスインできるモジュール。
> `ActiveSupport::Concern` を継承することで `included do` ブロックが使え、
> クラスレベルのコード（`rescue_from` など）をモジュール内に書ける。

---

## 2-4. ApplicationController に include する

`app/controllers/application_controller.rb`:

```ruby
class ApplicationController < ActionController::API
  # ✅ Concern を組み込む
  include ErrorHandleable
end
```

---

## 2-5. コントローラーをすっきりさせる

`app/controllers/api/v1/todos_controller.rb` から rescue を全部削除:

```ruby
module Api
  module V1
    class TodosController < ApplicationController

      def show
        todo = Todo.find(params[:id])
        render json: TodoSerializer.new(todo).serializable_hash
        # ✅ rescue 不要！ApplicationController が面倒を見る
      end

      def update
        todo = Todo.find(params[:id])
        if todo.update(todo_params)
          render json: TodoSerializer.new(todo).serializable_hash
        else
          render json: { errors: todo.errors.full_messages }, status: :unprocessable_entity
        end
        # ✅ rescue 不要！
      end

      def destroy
        todo = Todo.find(params[:id])
        todo.destroy
        head :no_content
        # ✅ rescue 不要！
      end

      private

      def todo_params
        params.require(:todo).permit(:title, :description, :status, :priority, :due_date)
      end
    end
  end
end
```

---

## 2-6. エラーレスポンスの統一形式

```
❌ 修正前: バラバラなエラー形式
  { "error": "Not found" }
  { "errors": ["Title can't be blank"] }

✅ 修正後: 統一されたエラー形式
  単数エラー:  { "error": "リソースが見つかりません" }
  複数エラー:  { "errors": ["タイトルを入力してください"] }
```

---

## 2-7. ✅ チェックリスト

- [ ] `app/controllers/concerns/error_handleable.rb` を作成
- [ ] `rescue_from` で主要な例外を網羅
- [ ] `render_error` で統一フォーマットのレスポンスを返す
- [ ] `ApplicationController` に `include ErrorHandleable` を追加
- [ ] `todos_controller.rb` から全 `rescue` を削除
- [ ] 存在しない ID にアクセスして 404 が返ることを確認

---
---

# Chapter 3 — RSpec でテストを書く

## 🎯 何を学ぶか

Rails のデフォルトテストフレームワーク（minitest）ではなく、実務でよく使われる **RSpec** を導入する。  
**モデルスペック** と **リクエストスペック** の2種類を学ぶ。

---

## 3-1. テストの種類と役割

```
┌─────────────────────────────────────────────────────────────────┐
│                    Rails テストの種類                            │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Unit Test（単体テスト）                                  │  │
│  │  ┌─────────────────────┐                                 │  │
│  │  │  Model Spec          │ バリデーション・メソッドをテスト │  │
│  │  │  spec/models/        │ DBに触れる、速い               │  │
│  │  └─────────────────────┘                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Integration Test（統合テスト）                           │  │
│  │  ┌─────────────────────┐                                 │  │
│  │  │  Request Spec        │ APIエンドポイントをE2Eでテスト  │  │
│  │  │  spec/requests/      │ ルーティング〜レスポンスまで    │  │
│  │  └─────────────────────┘                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3-2. gem のインストール

```ruby
# Gemfile の group :development, :test に追加

group :development, :test do
  gem "rspec-rails", "~> 7.0"
  gem "factory_bot_rails"   # テスト用データの工場
  gem "faker"               # ダミーデータ生成
  gem "shoulda-matchers"    # バリデーションテストの便利マッチャー
end
```

```bash
bundle install
rails generate rspec:install
```

`rspec:install` で以下が生成される:
```
.rspec               ← RSpec のオプション設定
spec/
  spec_helper.rb     ← RSpec 本体の設定
  rails_helper.rb    ← Rails との統合設定
```

---

## 3-3. RSpec の設定

`spec/rails_helper.rb` の末尾に追記:

```ruby
# shoulda-matchers の設定
Shoulda::Matchers.configure do |config|
  config.integrate do |with|
    with.test_framework :rspec
    with.library :rails
  end
end

# FactoryBot のメソッドを短縮形で使えるようにする
RSpec.configure do |config|
  config.include FactoryBot::Syntax::Methods
end
```

---

## 3-4. Factory を作る

`spec/factories/todos.rb` を作成:

```ruby
FactoryBot.define do
  factory :todo do
    title       { Faker::Lorem.sentence(word_count: 3) }
    description { Faker::Lorem.paragraph }
    status      { "pending" }
    priority    { "medium" }
    due_date    { nil }

    # ── トレイト: 状態のバリエーション ──────────────────────────
    # create(:todo, :completed) で使える
    trait :completed do
      status { "completed" }
    end

    trait :high_priority do
      priority { "high" }
    end

    trait :with_due_date do
      due_date { Date.today + 7 }
    end
  end
end
```

> **Factory とは**: テストデータの「型」を定義しておく仕組み。
> `create(:todo)` と書くだけでデフォルト値が入った Todo がDBに作られる。
> `trait` でバリエーションを定義すると `create(:todo, :completed)` のように使える。

---

## 3-5. モデルスペック

`spec/models/todo_spec.rb` を作成:

```ruby
require "rails_helper"

RSpec.describe Todo, type: :model do

  # ── 正常系: 正しいデータで作成できるか ─────────────────────────
  describe "validations" do
    context "正常なデータ" do
      it "title・status・priority があれば valid" do
        todo = build(:todo)
        expect(todo).to be_valid
      end
    end

    # ── title のバリデーション ───────────────────────────────────
    context "title" do
      it "空の場合は invalid" do
        todo = build(:todo, title: "")
        expect(todo).not_to be_valid
        expect(todo.errors[:title]).to include("can't be blank")
      end

      it "101文字以上は invalid" do
        todo = build(:todo, title: "a" * 101)
        expect(todo).not_to be_valid
      end

      it "100文字は valid" do
        todo = build(:todo, title: "a" * 100)
        expect(todo).to be_valid
      end
    end

    # ── status のバリデーション ──────────────────────────────────
    context "status" do
      it "pending は valid" do
        expect(build(:todo, status: "pending")).to be_valid
      end

      it "completed は valid" do
        expect(build(:todo, status: "completed")).to be_valid
      end

      it "不正な値は invalid" do
        todo = build(:todo, status: "invalid")
        expect(todo).not_to be_valid
      end
    end

    # ── shoulda-matchers を使った簡潔な書き方 ───────────────────
    it { is_expected.to validate_presence_of(:title) }
    it { is_expected.to validate_inclusion_of(:status).in_array(%w[pending completed]) }
    it { is_expected.to validate_inclusion_of(:priority).in_array(%w[low medium high]) }
  end
end
```

---

## 3-6. リクエストスペック

`spec/requests/api/v1/todos_spec.rb` を作成:

```ruby
require "rails_helper"

RSpec.describe "Api::V1::Todos", type: :request do

  # JSON ヘルパー: レスポンスを Hash に変換
  let(:json) { JSON.parse(response.body) }

  # ── GET /api/v1/todos ────────────────────────────────────────
  describe "GET /api/v1/todos" do
    before { create_list(:todo, 3) }

    it "200 を返し、todos の配列が含まれる" do
      get "/api/v1/todos"
      expect(response).to have_http_status(:ok)
      expect(json["data"].length).to eq(3)
    end

    context "status フィルタ" do
      before do
        create(:todo, :completed)
        create(:todo, status: "pending")
      end

      it "completed で絞り込める" do
        get "/api/v1/todos", params: { status: "completed" }
        statuses = json["data"].map { |t| t["attributes"]["status"] }
        expect(statuses).to all(eq("completed"))
      end
    end
  end

  # ── GET /api/v1/todos/:id ────────────────────────────────────
  describe "GET /api/v1/todos/:id" do
    let(:todo) { create(:todo) }

    it "200 を返し、todo の詳細が含まれる" do
      get "/api/v1/todos/#{todo.id}"
      expect(response).to have_http_status(:ok)
      expect(json["data"]["attributes"]["title"]).to eq(todo.title)
    end

    it "存在しない ID は 404 を返す" do
      get "/api/v1/todos/9999"
      expect(response).to have_http_status(:not_found)
    end
  end

  # ── POST /api/v1/todos ───────────────────────────────────────
  describe "POST /api/v1/todos" do
    let(:valid_params) { { todo: { title: "新しいタスク", priority: "high" } } }
    let(:invalid_params) { { todo: { title: "" } } }

    context "正常なパラメータ" do
      it "201 を返し、Todo が作成される" do
        expect {
          post "/api/v1/todos",
            params: valid_params.to_json,
            headers: { "Content-Type" => "application/json" }
        }.to change(Todo, :count).by(1)

        expect(response).to have_http_status(:created)
      end
    end

    context "不正なパラメータ" do
      it "422 を返し、errors が含まれる" do
        post "/api/v1/todos",
          params: invalid_params.to_json,
          headers: { "Content-Type" => "application/json" }

        expect(response).to have_http_status(:unprocessable_entity)
        expect(json["errors"]).to be_present
      end
    end
  end

  # ── PATCH /api/v1/todos/:id ──────────────────────────────────
  describe "PATCH /api/v1/todos/:id" do
    let(:todo) { create(:todo) }

    it "200 を返し、Todo が更新される" do
      patch "/api/v1/todos/#{todo.id}",
        params: { todo: { title: "更新タイトル" } }.to_json,
        headers: { "Content-Type" => "application/json" }

      expect(response).to have_http_status(:ok)
      expect(json["data"]["attributes"]["title"]).to eq("更新タイトル")
    end
  end

  # ── DELETE /api/v1/todos/:id ─────────────────────────────────
  describe "DELETE /api/v1/todos/:id" do
    let!(:todo) { create(:todo) }   # let! = テスト前に即時評価

    it "204 を返し、Todo が削除される" do
      expect {
        delete "/api/v1/todos/#{todo.id}"
      }.to change(Todo, :count).by(-1)

      expect(response).to have_http_status(:no_content)
    end
  end
end
```

---

## 3-7. テストを実行する

```bash
cd backend

# 全テスト実行
bundle exec rspec

# モデルスペックだけ
bundle exec rspec spec/models/

# リクエストスペックだけ
bundle exec rspec spec/requests/

# 特定ファイル
bundle exec rspec spec/models/todo_spec.rb

# 特定の行だけ（:28 行目）
bundle exec rspec spec/models/todo_spec.rb:28
```

実行結果の読み方:
```
.......                   ← . = テスト成功
F                         ← F = 失敗
*                         ← * = pending（保留）

Finished in 0.5 seconds
7 examples, 0 failures     ← これが全部通れば OK
```

---

## 3-8. ✅ チェックリスト

- [ ] `rspec-rails`, `factory_bot_rails`, `faker`, `shoulda-matchers` を Gemfile に追加
- [ ] `rails generate rspec:install` を実行
- [ ] `rails_helper.rb` に shoulda-matchers / FactoryBot の設定を追記
- [ ] `spec/factories/todos.rb` でトレイト付き Factory を定義
- [ ] `spec/models/todo_spec.rb` でバリデーションテストを作成
- [ ] `spec/requests/api/v1/todos_spec.rb` でAPIテストを作成
- [ ] `bundle exec rspec` で全テストがグリーンになることを確認

---
---

# Chapter 4 — JWT 認証を実装する

## 🎯 何を学ぶか

実務のAPIには必ず**認証**がある。  
`devise` + `devise-jwt` で **JWT（JSON Web Token）** によるステートレス認証を実装する。

---

## 4-1. JWT 認証の全体像

```
┌─────────────────────────────────────────────────────────────────┐
│                  JWT 認証フロー                                  │
│                                                                 │
│  ① ログイン                                                     │
│  ┌──────────┐  POST /auth/sign_in  ┌──────────────────────┐   │
│  │ React    │ ──────────────────▶  │ Rails (Devise)       │   │
│  │(フロント)│  {email, password}   │  パスワードを検証    │   │
│  │          │ ◀──────────────────  │  JWTトークン を発行  │   │
│  └──────────┘  Authorization:      └──────────────────────┘   │
│                Bearer eyJhbG...                                 │
│                                                                 │
│  ② 認証が必要なリクエスト                                       │
│  ┌──────────┐  GET /api/v1/todos   ┌──────────────────────┐   │
│  │ React    │ ──────────────────▶  │ Rails                │   │
│  │          │  Authorization:      │  JWTを検証           │   │
│  │          │  Bearer eyJhbG...    │  ✅ 有効 → 200       │   │
│  │          │ ◀──────────────────  │  ❌ 無効/期限切れ    │   │
│  └──────────┘                      │        → 401         │   │
│                                    └──────────────────────┘   │
│                                                                 │
│  ③ ログアウト                                                   │
│  DELETE /auth/sign_out → トークンを無効化（JWTデニーリスト）    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4-2. JWT とは

```
JWT の構造（Base64 エンコードされた3つのパーツ）

  eyJhbGciOiJIUzI1NiJ9  .  eyJ1c2VyX2lkIjoxfQ  .  SflKxwRJSMeKKF2QT4fwpMeJf36P...
  ─────────────────────    ───────────────────    ─────────────────────────────────
      Header                    Payload                    Signature
   (アルゴリズム等)           (任意のデータ)          (改ざん検知のための署名)

  {                         {
    "alg": "HS256",           "user_id": 1,
    "typ": "JWT"              "exp": 1713100000   ← 有効期限
  }                         }

  ポイント:
  ✅ サーバーはセッションを保存しない（ステートレス）
  ✅ Signature があるので改ざんできない
  ✅ Payload はデコードできるので機密情報は入れない
```

---

## 4-3. gem のインストール

```ruby
# Gemfile に追加
gem "devise"
gem "devise-jwt"
```

```bash
bundle install
rails generate devise:install
```

---

## 4-4. User モデルを作成する

```bash
rails generate devise User
```

マイグレーションファイルを確認・編集:

```ruby
# db/migrate/YYYYMMDD_devise_create_users.rb

class DeviseCreateUsers < ActiveRecord::Migration[8.1]
  def change
    create_table :users do |t|
      ## Database authenticatable
      t.string :email,              null: false, default: ""
      t.string :encrypted_password, null: false, default: ""

      ## Recoverable
      t.string   :reset_password_token
      t.datetime :reset_password_sent_at

      ## Rememberable
      t.datetime :remember_created_at

      t.timestamps null: false
    end

    add_index :users, :email,                unique: true
    add_index :users, :reset_password_token, unique: true
  end
end
```

JWT のデニーリスト用テーブル（ログアウト時にトークンを無効化するため）:

```bash
rails generate model JwtDenylist jti:string:index exp:datetime
```

```bash
rails db:migrate
```

---

## 4-5. モデルの設定

`app/models/user.rb`:

```ruby
class User < ApplicationRecord
  devise :database_authenticatable,
         :registerable,
         :recoverable,
         :validatable,
         :jwt_authenticatable,
         jwt_revocation_strategy: JwtDenylist  # ログアウト時にトークンを無効化
end
```

`app/models/jwt_denylist.rb`:

```ruby
class JwtDenylist < ApplicationRecord
  include Devise::JWT::RevocationStrategies::Denylist

  self.table_name = "jwt_denylists"
end
```

---

## 4-6. Devise の設定

`config/initializers/devise.rb` の重要部分を設定:

```ruby
Devise.setup do |config|
  # JWT のシークレットキー（本番では Rails credentials に入れる）
  config.jwt do |jwt|
    jwt.secret = Rails.application.credentials.secret_key_base
    jwt.dispatch_requests = [
      ["POST", %r{^/auth/sign_in$}]   # ログイン成功時にJWTを発行
    ]
    jwt.revocation_requests = [
      ["DELETE", %r{^/auth/sign_out$}] # ログアウト時にJWTを無効化
    ]
    jwt.expiration_time = 1.day.to_i   # トークンの有効期限
  end
end
```

---

## 4-7. ルーティングの設定

`config/routes.rb`:

```ruby
Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  # ✅ 認証エンドポイント
  devise_for :users,
    path: "auth",
    path_names: { sign_in: "sign_in", sign_out: "sign_out", registration: "sign_up" },
    controllers: {
      sessions:      "auth/sessions",
      registrations: "auth/registrations"
    }

  namespace :api do
    namespace :v1 do
      resources :todos
    end
  end
end
```

---

## 4-8. 認証コントローラーを作成する

`app/controllers/auth/sessions_controller.rb`:

```ruby
class Auth::SessionsController < Devise::SessionsController
  respond_to :json

  private

  # ── ログイン成功時のレスポンス ────────────────────────────────
  def respond_with(resource, _opts = {})
    render json: {
      user: {
        id:    resource.id,
        email: resource.email
      },
      message: "ログインしました"
    }, status: :ok
    # JWT トークンは devise-jwt が自動で Authorization ヘッダーにセットする
  end

  # ── ログアウト成功時のレスポンス ──────────────────────────────
  def respond_to_on_destroy
    render json: { message: "ログアウトしました" }, status: :ok
  end
end
```

`app/controllers/auth/registrations_controller.rb`:

```ruby
class Auth::RegistrationsController < Devise::RegistrationsController
  respond_to :json

  private

  def respond_with(resource, _opts = {})
    if resource.persisted?
      render json: {
        user:    { id: resource.id, email: resource.email },
        message: "ユーザー登録が完了しました"
      }, status: :created
    else
      render json: { errors: resource.errors.full_messages }, status: :unprocessable_entity
    end
  end
end
```

---

## 4-9. API を認証で保護する

`app/controllers/application_controller.rb`:

```ruby
class ApplicationController < ActionController::API
  include ErrorHandleable

  # ✅ JWT 認証を有効化
  before_action :authenticate_user!

  # 未認証アクセス時のレスポンスをカスタマイズ
  rescue_from Devise::JWT::RevocationStrategies::Denylist do
    render_error(:unauthorized, "トークンが無効です")
  end
end
```

`app/controllers/concerns/error_handleable.rb` に追記:

```ruby
# 未認証アクセス
rescue_from Warden::NotAuthenticated do
  render_error(:unauthorized, "認証が必要です")
end
```

---

## 4-10. 動作確認

```bash
# ユーザー登録
curl -X POST http://localhost:3000/auth/sign_up \
  -H "Content-Type: application/json" \
  -d '{"user": {"email": "test@example.com", "password": "password123"}}'

# ログイン（レスポンスヘッダーの Authorization: Bearer xxx を保存）
curl -v -X POST http://localhost:3000/auth/sign_in \
  -H "Content-Type: application/json" \
  -d '{"user": {"email": "test@example.com", "password": "password123"}}'
# → レスポンスヘッダー: Authorization: Bearer eyJhbGci...

# トークンを使ってAPIアクセス
curl http://localhost:3000/api/v1/todos \
  -H "Authorization: Bearer eyJhbGci..."

# トークンなしでアクセス → 401
curl http://localhost:3000/api/v1/todos
```

---

## 4-11. ✅ チェックリスト

- [ ] `devise`, `devise-jwt` を Gemfile に追加
- [ ] `rails generate devise:install` と `rails generate devise User` を実行
- [ ] `JwtDenylist` モデルを作成してマイグレーション実行
- [ ] `User` モデルに `jwt_authenticatable` を追加
- [ ] `devise.rb` で JWT の secret / expiration を設定
- [ ] `routes.rb` に認証エンドポイントを追加
- [ ] `Auth::SessionsController` / `Auth::RegistrationsController` を作成
- [ ] `ApplicationController` に `before_action :authenticate_user!` を追加
- [ ] curl でログイン→トークン取得→API呼び出しの流れを確認

---
---

# Chapter 5 — Service Object と Concern でコードを整理する

## 🎯 何を学ぶか

Rails の「Fat Controller / Fat Model 問題」を解消するための設計パターン。  
**Service Object**（ビジネスロジックの分離）と **Concern**（共通ロジックのモジュール化）を学ぶ。

---

## 5-1. Fat Controller 問題とは

```
❌ 問題のあるコントローラー（ビジネスロジックが混在）

  def create
    todo = Todo.new(todo_params)

    # ← このあたりからビジネスロジックが膨らんでくる
    if todo.due_date && todo.due_date < Date.today
      return render json: { error: "期限は今日以降にしてください" }, status: :unprocessable_entity
    end

    # 優先度を自動判定するロジック
    if todo.due_date && todo.due_date <= Date.today + 3
      todo.priority = "high"
    end

    # 通知を送るロジック（将来追加）
    # NotificationService.send(todo) ...

    if todo.save
      render json: TodoSerializer.new(todo).serializable_hash, status: :created
    else
      render json: { errors: todo.errors.full_messages }, status: :unprocessable_entity
    end
  end
  # ↑ コントローラーがどんどん太くなる...
```

---

## 5-2. 責任の分離

```
┌─────────────────────────────────────────────────────────────────┐
│                   責任の分離 (Separation of Concerns)            │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Controller の責任                                        │  │
│  │  ✅ リクエストを受け取る                                  │  │
│  │  ✅ パラメータを検証する（Strong Parameters）             │  │
│  │  ✅ Service を呼び出す                                    │  │
│  │  ✅ レスポンスを返す                                      │  │
│  │  ❌ ビジネスロジックを書かない                            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Service Object の責任                                    │  │
│  │  ✅ ビジネスロジックを実行する                            │  │
│  │  ✅ 複数モデルをまたぐ処理                                │  │
│  │  ✅ 外部APIの呼び出し                                     │  │
│  │  ❌ HTTPリクエスト/レスポンスを知らない                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Model の責任                                             │  │
│  │  ✅ バリデーション                                        │  │
│  │  ✅ アソシエーション                                      │  │
│  │  ✅ スコープ（DB クエリ）                                 │  │
│  │  ❌ ビジネスロジックを書かない（Fat Model も避ける）      │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5-3. Model に Scope を追加する

まずモデルに **Named Scope**（よく使うクエリに名前をつける）を追加する。

`app/models/todo.rb`:

```ruby
class Todo < ApplicationRecord
  validates :title, presence: true, length: { maximum: 100 }
  validates :status, inclusion: { in: %w[pending completed] }
  validates :priority, inclusion: { in: %w[low medium high] }

  # ── Named Scopes: よく使うクエリに名前をつける ──────────────

  # 未完了のものだけ
  scope :pending,   -> { where(status: "pending") }

  # 完了済みのものだけ
  scope :completed, -> { where(status: "completed") }

  # 期限切れ（今日より前 かつ 未完了）
  scope :overdue,   -> { pending.where("due_date < ?", Date.today) }

  # 高優先度
  scope :urgent,    -> { where(priority: "high") }

  # キーワード検索
  scope :search, ->(q) {
    return all if q.blank?
    where("title LIKE ? OR description LIKE ?", "%#{q}%", "%#{q}%")
  }

  # ── インスタンスメソッド ────────────────────────────────────

  def complete!
    update!(status: "completed")
  end

  def overdue?
    due_date.present? && due_date < Date.today && status == "pending"
  end
end
```

> **scope のメリット**:
> ```ruby
> # スコープはチェーンできる
> Todo.pending.urgent          # 未完了かつ高優先度
> Todo.search("買い物").overdue # 「買い物」を含む期限切れ
> ```

---

## 5-4. Service Object を作る

`Todos::CreateService` — Todo 作成のビジネスロジックを集約:

```bash
mkdir -p app/services/todos
```

`app/services/todos/create_service.rb`:

```ruby
module Todos
  class CreateService
    # Result オブジェクト: 成功/失敗をラップして返す
    Result = Struct.new(:success?, :todo, :errors, keyword_init: true)

    def initialize(params:, current_user:)
      @params       = params
      @current_user = current_user
    end

    def call
      todo = Todo.new(@params)

      # ── ビジネスロジック ────────────────────────────────────

      # 期限が過去の場合はエラー
      if todo.due_date.present? && todo.due_date < Date.today
        return Result.new(
          success?: false,
          errors:   ["期限は今日以降の日付を入力してください"]
        )
      end

      # 期限が3日以内なら自動で優先度を high に上げる
      if todo.due_date.present? && todo.due_date <= Date.today + 3
        todo.priority = "high"
      end

      # 将来: current_user と紐付ける
      # todo.user = @current_user

      if todo.save
        Result.new(success?: true, todo: todo)
      else
        Result.new(success?: false, errors: todo.errors.full_messages)
      end
    end
  end
end
```

---

## 5-5. コントローラーからサービスを呼ぶ

`app/controllers/api/v1/todos_controller.rb`:

```ruby
module Api
  module V1
    class TodosController < ApplicationController

      # GET /api/v1/todos
      def index
        todos = Todo.all
                    .then { |q| params[:status].present?   ? q.where(status: params[:status]) : q }
                    .then { |q| params[:priority].present? ? q.where(priority: params[:priority]) : q }
                    .search(params[:q])
                    .order(created_at: :desc)

        render json: TodoSerializer.new(todos).serializable_hash
      end

      # POST /api/v1/todos
      def create
        # ✅ Service Object に処理を委譲
        result = Todos::CreateService.new(
          params:       todo_params,
          current_user: current_user  # JWT認証後は current_user が使える
        ).call

        if result.success?
          render json: TodoSerializer.new(result.todo).serializable_hash, status: :created
        else
          render json: { errors: result.errors }, status: :unprocessable_entity
        end
      end

      # ... show / update / destroy は省略

      private

      def todo_params
        params.require(:todo).permit(:title, :description, :status, :priority, :due_date)
      end
    end
  end
end
```

---

## 5-6. Concern で共通ロジックを切り出す

コントローラーの共通処理（ページネーション、ソートなど）を Concern に切り出す例:

`app/controllers/concerns/paginatable.rb`:

```ruby
module Paginatable
  extend ActiveSupport::Concern

  # デフォルトのページサイズ
  DEFAULT_PER_PAGE = 20
  MAX_PER_PAGE     = 100

  private

  # クエリパラメータからページネーション情報を取得
  def pagination_params
    page     = [params[:page].to_i, 1].max
    per_page = [[params[:per_page].to_i, DEFAULT_PER_PAGE].max, MAX_PER_PAGE].min
    { page: page, per_page: per_page }
  end

  # ページネーション用メタ情報を構築
  def pagination_meta(collection, per_page:)
    {
      current_page: collection.current_page,
      total_pages:  collection.total_pages,
      total_count:  collection.total_count,
      per_page:     per_page
    }
  end
end
```

> **注意**: このページネーション Concern を使う場合は `kaminari` または `pagy` gem が必要。  
> `gem "kaminari"` を Gemfile に追加して `bundle install` すること。

コントローラーでの使用例:

```ruby
class ApplicationController < ActionController::API
  include ErrorHandleable
  include Paginatable  # ✅ ここで include
end

# todos_controller.rb の index アクション
def index
  pp = pagination_params

  todos = Todo.all
              .search(params[:q])
              .order(created_at: :desc)
              .page(pp[:page])
              .per(pp[:per_page])

  render json: {
    data: TodoSerializer.new(todos).serializable_hash[:data],
    meta: pagination_meta(todos, per_page: pp[:per_page])
  }
end
```

レスポンス例:
```json
{
  "data": [ ... ],
  "meta": {
    "current_page": 1,
    "total_pages": 5,
    "total_count": 98,
    "per_page": 20
  }
}
```

---

## 5-7. 全体のディレクトリ構成（完成後）

```
backend/app/
├── controllers/
│   ├── application_controller.rb    ← authenticate_user!, include Concerns
│   ├── auth/
│   │   ├── sessions_controller.rb       ← ログイン / ログアウト
│   │   └── registrations_controller.rb  ← ユーザー登録
│   ├── concerns/
│   │   ├── error_handleable.rb      ← 共通エラーハンドリング (Ch.2)
│   │   └── paginatable.rb           ← 共通ページネーション (Ch.5)
│   └── api/
│       └── v1/
│           └── todos_controller.rb  ← スッキリしたコントローラー
│
├── models/
│   ├── todo.rb                      ← Scope・インスタンスメソッド (Ch.5)
│   ├── user.rb                      ← Devise + JWT (Ch.4)
│   └── jwt_denylist.rb              ← JWTトークン無効化リスト (Ch.4)
│
├── serializers/
│   └── todo_serializer.rb           ← レスポンス形式の制御 (Ch.1)
│
└── services/
    └── todos/
        └── create_service.rb        ← ビジネスロジック (Ch.5)

spec/
├── factories/
│   └── todos.rb                     ← テストデータ工場 (Ch.3)
├── models/
│   └── todo_spec.rb                 ← モデルテスト (Ch.3)
└── requests/
    └── api/
        └── v1/
            └── todos_spec.rb        ← APIテスト (Ch.3)
```

---

## 5-8. ✅ チェックリスト

- [ ] `app/models/todo.rb` に Named Scope を追加
  - [ ] `scope :pending`, `scope :completed`, `scope :overdue`, `scope :search`
  - [ ] `complete!` インスタンスメソッドを追加
- [ ] `app/services/todos/create_service.rb` を作成
  - [ ] `Result` Struct でレスポンスをラップ
  - [ ] ビジネスロジック（期限チェック・自動優先度設定）を実装
- [ ] `todos_controller.rb` の `create` を Service 呼び出しに変更
- [ ] `app/controllers/concerns/paginatable.rb` を作成
- [ ] `ApplicationController` に `include Paginatable` を追加
- [ ] `kaminari` を導入してページネーションが動作することを確認

---
---

# 📋 全体チェックリスト & 学習順序

```
┌─────────────────────────────────────────────────────────────────┐
│              推奨する学習順序                                    │
│                                                                 │
│  Week 1                                                         │
│  ├── Ch.1 シリアライザー    → レスポンス形式を制御できる        │
│  └── Ch.2 エラーハンドリング → 堅牢なAPIの基礎                 │
│                                                                 │
│  Week 2                                                         │
│  └── Ch.3 RSpec テスト      → Ch.1/2 で作ったコードをテスト    │
│                                 (テストを書いてから次へ進む習慣)│
│                                                                 │
│  Week 3                                                         │
│  └── Ch.4 JWT 認証          → 実務APIに必須の認証を理解        │
│                                                                 │
│  Week 4                                                         │
│  └── Ch.5 Service / Concern → コードを設計できるレベルへ       │
└─────────────────────────────────────────────────────────────────┘
```

| Chapter | テーマ | 難易度 | 実務での重要度 |
|---|---|---|---|
| Ch.1 | シリアライザー | ★★☆☆ | ★★★★ |
| Ch.2 | エラーハンドリング | ★★☆☆ | ★★★★★ |
| Ch.3 | RSpec テスト | ★★★☆ | ★★★★★ |
| Ch.4 | JWT 認証 | ★★★★ | ★★★★★ |
| Ch.5 | Service / Concern | ★★★☆ | ★★★★ |

---

> **この先の発展テーマ**
> - Active Storage（ファイルアップロード）
> - Action Mailer（メール送信）
> - Background Job（非同期処理、Sidekiq）
> - GraphQL（REST に代わるAPI設計）
> - Docker + Kamal（本番デプロイ）
