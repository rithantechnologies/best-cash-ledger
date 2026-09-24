#!/usr/bin/env bash
set -euo pipefail

NODE="/home/cashledger/.nvm/versions/node/v22.23.2/bin/node"
NPM="/home/cashledger/.nvm/versions/node/v22.23.2/bin/npm"
ROOT="/var/www/cashledger"
RUNTIME_ENV_FILE="${CASHLEDGER_ENV_FILE:-$ROOT/apps/api/.env}"
WEB_BASE_PATH="${CASHLEDGER_BASE_PATH:-/cashledger}"

if [ ! -f "$RUNTIME_ENV_FILE" ]; then
  echo "Cash Ledger runtime env file not found: $RUNTIME_ENV_FILE" >&2
  exit 1
fi

API_PORT="$(sed -n 's/^PORT=//p' "$RUNTIME_ENV_FILE" | tail -1)"
API_PORT="${API_PORT:-4001}"

tmux kill-session -t cashledger-api 2>/dev/null || true
tmux kill-session -t cashledger-web 2>/dev/null || true

tmux new-session -d -s cashledger-api "set -a; . '$RUNTIME_ENV_FILE'; set +a; cd '$ROOT/apps/api' && exec '$NODE' dist/main"

for attempt in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:$API_PORT/api/health" >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 20 ]; then
    echo "Cash Ledger API did not become healthy on port $API_PORT within 20 seconds." >&2
    tmux capture-pane -pt cashledger-api -S -30 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

tmux new-session -d -s cashledger-web "cd '$ROOT/apps/web' && API_ORIGIN='http://127.0.0.1:$API_PORT' exec '$NPM' run start -- -H 127.0.0.1 -p 3200"

for attempt in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:3200$WEB_BASE_PATH/api/health" >/dev/null 2>&1; then
    echo "Cash Ledger restarted successfully (API port $API_PORT)."
    exit 0
  fi
  sleep 1
done

echo "Cash Ledger web proxy did not become healthy within 20 seconds." >&2
tmux capture-pane -pt cashledger-api -S -30 2>/dev/null || true
tmux capture-pane -pt cashledger-web -S -30 2>/dev/null || true
exit 1
