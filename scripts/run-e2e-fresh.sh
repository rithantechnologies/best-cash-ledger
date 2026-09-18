#!/usr/bin/env bash
set -euo pipefail

SUITE="${1:?suite script required}"
ROOT="/var/www/cashledger"
API="$ROOT/apps/api"
SESSION="cashledger-e2e-hardening"

source /home/cashledger/.nvm/nvm.sh
set -a
source "$API/.env"
set +a
node "$ROOT/scripts/prepare-e2e-hardening.mjs"

cd "$API"
set -a
source .env.e2e-hardening
set +a
npx prisma migrate deploy >/tmp/cashledger-e2e-migrate.log
node prisma/seed.mjs >/tmp/cashledger-e2e-seed.log

if tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux kill-session -t "$SESSION"
fi
tmux new-session -d -s "$SESSION"
tmux send-keys -t "$SESSION" "source /home/cashledger/.nvm/nvm.sh && cd $API && set -a && source .env.e2e-hardening && set +a && npm run start:prod" C-m

for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:4002/api/health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS http://127.0.0.1:4002/api/health >/dev/null

cd "$ROOT"
set -a
source "$API/.env.e2e-hardening"
export TEST_DATABASE_URL="$DATABASE_URL"
set +a
node "$ROOT/$SUITE"
