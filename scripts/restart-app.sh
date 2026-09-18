#!/usr/bin/env bash
set -euo pipefail

NODE="/home/cashledger/.nvm/versions/node/v22.23.2/bin/node"
NPM="/home/cashledger/.nvm/versions/node/v22.23.2/bin/npm"
ROOT="/var/www/cashledger"

tmux kill-session -t cashledger-api 2>/dev/null || true
tmux kill-session -t cashledger-web 2>/dev/null || true

tmux new-session -d -s cashledger-api "cd $ROOT/apps/api && $NODE dist/main"
tmux new-session -d -s cashledger-web "cd $ROOT/apps/web && $NPM run start -- -H 127.0.0.1 -p 3200"

for attempt in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3200/cashledger/api/health >/dev/null 2>&1; then
    echo "Cash Ledger restarted successfully."
    exit 0
  fi
  sleep 1
done

echo "Cash Ledger did not become healthy within 20 seconds." >&2
tmux capture-pane -pt cashledger-api -S -30 2>/dev/null || true
tmux capture-pane -pt cashledger-web -S -30 2>/dev/null || true
exit 1
