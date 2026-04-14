ENV["BUNDLE_GEMFILE"] ||= File.expand_path("../Gemfile", __dir__)

require "bundler/setup" # Set up gems listed in the Gemfile.
# bootsnap は日本語パス環境で動作しないため無効化
# require "bootsnap/setup"
