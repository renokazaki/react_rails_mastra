class CreateTodos < ActiveRecord::Migration[8.1]
  def change
    create_table :todos do |t|
      t.string :title, null: false          # null 禁止
      t.text :description
      t.string :status, default: "pending"  # デフォルト値
      t.string :priority, default: "medium" # デフォルト値
      t.date :due_date

      t.timestamps
    end
  end
end