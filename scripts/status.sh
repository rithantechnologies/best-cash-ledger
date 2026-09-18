#!/usr/bin/env bash
set -euo pipefail

echo "Cash Ledger tmux sessions:"
tmux ls 2>/dev/null | grep -E 'cashledger-(api|web)' || true
echo
echo "Listening ports:"
ss -lntp | grep -E '127.0.0.1:(3200|4001)' || true
echo
echo "Health:"
curl -fsS http://127.0.0.1:3200/cashledger/api/health
echo
