# This file should ensure the existence of records required to run the application in every environment (production,
# development, test). The code here should be idempotent so that it can be executed at any point in every environment.
# The data can then be loaded with the bin/rails db:seed command (or created alongside the database with db:setup).
#
# Example:
#
#   ["Action", "Comedy", "Drama", "Horror"].each do |genre_name|
#     MovieGenre.find_or_create_by!(name: genre_name)
#   end
Todo.create!([
  { title: "Rails の勉強", description: "ルーティング・モデル・コントローラーを学ぶ", priority: "high" },
  { title: "React と繋げる", description: "CORS 設定と API クライアントを実装", priority: "medium" },
  { title: "Mastra を試す", priority: "low" },
])