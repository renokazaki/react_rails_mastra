class Todo < ApplicationRecord
    # バリデーション: title は必須
    validates :title, presence: true, length: { maximum: 100 }
  
    # status は pending か completed のみ許可
    validates :status, inclusion: { in: %w[pending completed] }
  
    # priority は low / medium / high のみ許可
    validates :priority, inclusion: { in: %w[low medium high] }
  end