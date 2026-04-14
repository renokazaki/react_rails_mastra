# Phase 1 ハンズオンガイド — Rails API で Todo バックエンドを作る

> **目標**: Rails API モードで Todo の CRUD API を実装し、React フロントエンドと繋げる。
> **前提**: Ruby / Rails のインストール済み。`backend/` ディレクトリに Rails 8 プロジェクトが存在している。

---

## 0. Rails API モードとは

通常の Rails はビュー（HTML）も生成するフルスタックフレームワーク。  
**API モード**はその View 層を丸ごと省いた軽量版で、JSON を返すことだけに特化している。

`backend/config/application.rb` を見ると以下の行が確認できる:

```ruby
config.api_only = true
```

これが API モードの宣言。セッション・Cookie・Flash などの Middleware が自動的に除外される。

---

## 1. rack-cors の設定 — CORS を許可する

React（localhost:5173）から Rails（localhost:3000）への API リクエストはブラウザの **CORS ポリシー**でブロックされる。  
`rack-cors` gem でこれを許可する。

### 1-1. Gemfile に追加

`backend/Gemfile` を開き、コメントアウトされている行を有効にする:

```ruby
# 変更前
# gem "rack-cors"

# 変更後
gem "rack-cors"
```

### 1-2. bundle install

```bash
cd backend
bundle install
```

### 1-3. CORS 設定ファイルを作成

`backend/config/initializers/cors.rb` を作成:

```ruby
Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins "http://localhost:5173"  # React の開発サーバー

    resource "*",
      headers: :any,
      methods: [:get, :post, :put, :patch, :delete, :options, :head]
  end
end
```

> **ポイント**: `origins` に React の URL を指定する。本番環境では実際のドメインに変える。

---

## 2. Todo モデルとマイグレーション

Rails の **MVC** のうち M（Model）= データ層を作る。

### 2-1. モデル生成コマンド

```bash
rails generate model Todo \
  title:string \
  description:text \
  status:string \
  priority:string \
  due_date:date
```

このコマンドで以下が自動生成される:
- `app/models/todo.rb` — モデルクラス
- `db/migrate/YYYYMMDDHHMMSS_create_todos.rb` — マイグレーションファイル

### 2-2. マイグレーションファイルを確認・編集

`db/migrate/..._create_todos.rb` を開いて、デフォルト値を追加する:

```ruby
class CreateTodos < ActiveRecord::Migration[8.1]
  def change
    create_table :todos do |t|
      t.string :title, null: false          # null 禁止
      t.text :description
      t.string :status, default: "pending"  # デフォルト値
      t.string :priority, default: "medium" # デフォルト値
      t.date :due_date

      t.timestamps  # created_at と updated_at を自動生成
    end
  end
end
```

### 2-3. マイグレーション実行

```bash
rails db:create   # DB ファイルを作成
rails db:migrate  # テーブルを作成
```

実行後、`db/schema.rb` にテーブル定義が書き出される。これが **現在の DB の正」な状態**。

### 2-4. Todo モデルにバリデーションを追加

`app/models/todo.rb` を編集:

```ruby
class Todo < ApplicationRecord
  # バリデーション: title は必須
  validates :title, presence: true, length: { maximum: 100 }

  # status は pending か completed のみ許可
  validates :status, inclusion: { in: %w[pending completed] }

  # priority は low / medium / high のみ許可
  validates :priority, inclusion: { in: %w[low medium high] }
end
```

> **Rails コンソールで確認してみよう**:
> ```bash
> rails console
> Todo.create(title: "テスト")          # 成功
> Todo.create(title: "")               # 失敗（バリデーションエラー）
> Todo.all                             # 一覧取得
> ```

---

## 3. ルーティング

`config/routes.rb` を編集して API エンドポイントを定義する:

```ruby
Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  # /api/v1/todos に CRUD ルートをまとめて定義
  namespace :api do
    namespace :v1 do
      resources :todos
    end
  end
end
```

> **`namespace` とは**: URL に `/api/v1` というプレフィックスをつけ、コントローラーも `Api::V1::` という名前空間に配置する仕組み。バージョン管理がしやすくなる。

設定後、`rails routes` で確認:

```bash
rails routes | grep todo
```

以下のようなルートが表示されれば OK:

```
GET    /api/v1/todos          api/v1/todos#index
POST   /api/v1/todos          api/v1/todos#create
GET    /api/v1/todos/:id      api/v1/todos#show
PATCH  /api/v1/todos/:id      api/v1/todos#update
PUT    /api/v1/todos/:id      api/v1/todos#update
DELETE /api/v1/todos/:id      api/v1/todos#destroy
```

---

## 4. コントローラー

**C（Controller）**= リクエストを受け取って、モデルを操作し、JSON を返す層。

### 4-1. ディレクトリ作成とファイル生成

```bash
mkdir -p app/controllers/api/v1
```

`app/controllers/api/v1/todos_controller.rb` を新規作成:

```ruby
module Api
  module V1
    class TodosController < ApplicationController

      # GET /api/v1/todos
      def index
        todos = Todo.all

        # クエリパラメータによるフィルタ
        todos = todos.where(status: params[:status])     if params[:status].present?
        todos = todos.where(priority: params[:priority]) if params[:priority].present?

        # キーワード検索（タイトルまたは説明に含む）
        if params[:q].present?
          q = "%#{params[:q]}%"
          todos = todos.where("title LIKE ? OR description LIKE ?", q, q)
        end

        render json: todos.order(created_at: :desc)
      end

      # GET /api/v1/todos/:id
      def show
        todo = Todo.find(params[:id])
        render json: todo
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Not found" }, status: :not_found
      end

      # POST /api/v1/todos
      def create
        todo = Todo.new(todo_params)
        if todo.save
          render json: todo, status: :created
        else
          render json: { errors: todo.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # PATCH/PUT /api/v1/todos/:id
      def update
        todo = Todo.find(params[:id])
        if todo.update(todo_params)
          render json: todo
        else
          render json: { errors: todo.errors.full_messages }, status: :unprocessable_entity
        end
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Not found" }, status: :not_found
      end

      # DELETE /api/v1/todos/:id
      def destroy
        todo = Todo.find(params[:id])
        todo.destroy
        head :no_content  # 204 No Content を返す
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Not found" }, status: :not_found
      end

      private

      # Strong Parameters: 許可するパラメータを明示する（セキュリティ対策）
      def todo_params
        params.require(:todo).permit(:title, :description, :status, :priority, :due_date)
      end
    end
  end
end
```

### Strong Parameters について

Rails では `params.require(:todo).permit(...)` という形で**受け入れるパラメータを明示的に宣言する**。  
これにより意図しないカラムへの値の書き込み（Mass Assignment 攻撃）を防ぐ。

---

## 5. サーバー起動と動作確認

```bash
cd backend
rails server  # または rails s
```

### curl で確認

```bash
# 一覧取得
curl http://localhost:3000/api/v1/todos

# Todo 作成
curl -X POST http://localhost:3000/api/v1/todos \
  -H "Content-Type: application/json" \
  -d '{"todo": {"title": "買い物", "priority": "high"}}'

# 完了に更新
curl -X PATCH http://localhost:3000/api/v1/todos/1 \
  -H "Content-Type: application/json" \
  -d '{"todo": {"status": "completed"}}'

# 削除
curl -X DELETE http://localhost:3000/api/v1/todos/1
```

---

## 6. シードデータ（任意）

`db/seeds.rb` にサンプルデータを書いておくと開発が楽になる:

```ruby
Todo.create!([
  { title: "Rails の勉強", description: "ルーティング・モデル・コントローラーを学ぶ", priority: "high" },
  { title: "React と繋げる", description: "CORS 設定と API クライアントを実装", priority: "medium" },
  { title: "Mastra を試す", priority: "low" },
])
```

```bash
rails db:seed
```

---

## 7. React と繋げる

Rails サーバー（3000番）と React 開発サーバー（5173番）を両方起動すれば完成。

```bash
# ターミナル 1
cd backend && rails s

# ターミナル 2
cd frontend && npm run dev
```

`frontend/.env.local` に以下が設定されていることを確認:

```
VITE_API_BASE_URL=http://localhost:3000/api/v1
```

---

## 8. よくあるエラーと対処法

| エラー | 原因 | 対処 |
|---|---|---|
| `CORS error` | rack-cors 未設定 | 手順 1 を確認 |
| `422 Unprocessable Entity` | バリデーションエラー | レスポンスの `errors` を確認 |
| `404 Not Found` | ルート未定義 or ID 不一致 | `rails routes` で確認 |
| `NameError: uninitialized constant` | namespace ディレクトリ構造が違う | `app/controllers/api/v1/` にファイルがあるか確認 |
| `ActiveRecord::RecordNotFound` | 存在しない ID にアクセス | rescue で 404 を返す |

---

## チェックリスト

- [ ] `rack-cors` を Gemfile に追加して `bundle install`
- [ ] `config/initializers/cors.rb` を作成
- [ ] `rails generate model Todo ...` でモデル生成
- [ ] マイグレーションファイルに `null: false` と `default:` を追加
- [ ] `rails db:create && rails db:migrate` を実行
- [ ] `app/models/todo.rb` にバリデーション追加
- [ ] `config/routes.rb` に namespace ルート追加
- [ ] `app/controllers/api/v1/todos_controller.rb` を作成
- [ ] `rails s` で起動して curl で動作確認
- [ ] React フロントエンドと繋いで画面から操作できることを確認
