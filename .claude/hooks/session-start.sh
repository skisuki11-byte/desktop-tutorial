#!/bin/bash
# Claude Code on the web 用のセットアップ。
# コンテナは毎回作り直されるため、必要なものをここで入れ直す。
#   - numpy       : fx/tools/*.py（設計書の数値計算）に必要
#   - Codex CLI   : 設計・コードのクロスレビュー用
# ローカル環境では何もしない。
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo "[session-start] fx/ の Python 依存を導入中..."
if [ -f "${CLAUDE_PROJECT_DIR:-.}/fx/requirements.txt" ]; then
  pip install --quiet --disable-pip-version-check --root-user-action=ignore \
    -r "${CLAUDE_PROJECT_DIR:-.}/fx/requirements.txt"
fi

echo "[session-start] Codex CLI を導入中..."
if ! command -v codex >/dev/null 2>&1; then
  npm install -g @openai/codex >/dev/null 2>&1 || {
    echo "[session-start] 警告: Codex CLI の導入に失敗（レビュー以外の作業には影響なし）"
  }
fi

# APIキーが環境変数にあれば自動ログインする。
# キーは環境設定側で OPENAI_API_KEY として渡すこと（リポジトリには絶対に置かない）。
if command -v codex >/dev/null 2>&1; then
  if [ -n "${OPENAI_API_KEY:-}" ] && ! codex login status >/dev/null 2>&1; then
    printenv OPENAI_API_KEY | codex login --with-api-key >/dev/null 2>&1 \
      && echo "[session-start] Codex ログイン完了" \
      || echo "[session-start] 警告: Codex ログイン失敗（キーを確認）"
  elif [ -z "${OPENAI_API_KEY:-}" ]; then
    echo "[session-start] 備考: OPENAI_API_KEY 未設定のため Codex は未ログイン"
  fi
fi

echo "[session-start] 完了"
