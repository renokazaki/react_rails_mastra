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