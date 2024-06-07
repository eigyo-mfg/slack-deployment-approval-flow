# Slack Deployment Approval Flow

# Overview

- slack から github actions を実行してデプロイを実行するための関数

# Getting started

## install

curl -fsSL https://downloads.slack-edge.com/slack-cli/install.sh | bash

# Usage

## slack にデプロイ（未公開アプリのため）

1. clone  
   `git clone git@github.com:eigyo-mfg/slack-deployment-approval-flow.git`
2. slack コマンドをインストール  
   `curl -fsSL https://downloads.slack-edge.com/slack-cli/install.sh | bash`
3. slack にログイン  
   `slack login`
4. デプロイ  
   `slack deploy`

## slack workflow のステップに組み込む

slack workflow サイドバーから「deployment approval flow」を選択して追加する
引数を設定する

- Commit Hash
- Github Repository Owner
  - repository のオーナー
- Github Repository
  - github actions を実行している repository
- Send To Slack Channel Id Staging
  - ステージング環境にデプロイするボタンの通知先チャンネル
- Send To Slack Channel Id Production
  - 本番環境にデプロイするボタンの通知先チャンネル
