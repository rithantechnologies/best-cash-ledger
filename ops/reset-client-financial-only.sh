#!/usr/bin/env bash
# One-time Option A: clear client financial records and balances, preserve masters.
# Must run in the NEW client Hostinger root terminal. A full backup is mandatory.
set -euo pipefail
umask 077
if [[ "$(id -u)" != 0 || "$(hostname)" != 'srv2067503' ]]; then
 echo "REFUSED: run only as root on new client VPS srv2067503"; exit 1
fi
REPO=/home/cashdeploy/cashledger-source
ENV=/etc/cashledger/cashledger.env
BACKUP=/etc/cashledger/migration/client-before-financial-reset-20261016.dump
PRIVATE_DIR=/etc/cashledger/ops
RESET_SRC="$REPO/ops/client-financial-reset.cjs"
RESET="$PRIVATE_DIR/client-financial-reset.cjs"
BACKUP_SRC="$REPO/ops/client-financial-reset-backup.cjs"
API=cashledger-api-client.service
WEB=cashledger-web-client.service

exec 9>/run/lock/cashledger-client-financial-reset.lock
flock -n 9 || { echo "REFUSED: another client reset is already in progress"; exit 1; }
if [[ "$(readlink -f /var/www/cashledger/current)" != '/var/www/cashledger/releases/058a442ac981f59fe6bf19cc9823e6c1753ea8bc-bestmoney-root' ]]; then
 echo "REFUSED: active application release changed"; exit 1
fi
# Allow root to inspect this one known cashdeploy-owned checkout only.
# Do NOT change root's global git safe.directory configuration.
[[ "$(git -c safe.directory="$REPO" -C "$REPO" branch --show-current)" == 'main' ]] ||
 { echo "REFUSED: scripts not on git main"; exit 1; }
[[ -z "$(git -c safe.directory="$REPO" -C "$REPO" status --porcelain)" ]] ||
 { echo "REFUSED: git checkout has uncommitted files"; exit 1; }
for f in "$ENV" "$RESET_SRC" "$BACKUP_SRC"; do
 [[ -f "$f" ]] || { echo "REFUSED: missing $f"; exit 1; }
done
[[ -d /etc/cashledger/migration ]] ||
 { echo "REFUSED: client backup directory missing"; exit 1; }
[[ ! -e "$BACKUP" ]] ||
 { echo "REFUSED: pre-reset backup already exists; will not run reset twice"; exit 1; }
for svc in "$API" "$WEB" postgresql.service nginx.service; do
 systemctl is-active --quiet "$svc" ||
  { echo "REFUSED: prerequisite service not active: $svc"; exit 1; }
done
[[ "$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' http://127.0.0.1:4001/api/health)" == 200 ]] ||
 { echo "REFUSED: API unhealthy before reset"; exit 1; }

echo "1/7 Secure root-only preparation of verified DB reset logic"
install -d -o root -g cashledger -m 0750 "$PRIVATE_DIR"
if [[ -e "$RESET" ]]; then
 cmp -s "$RESET_SRC" "$RESET" || { echo "REFUSED: existing reset program differs"; exit 1; }
else
 install -o root -g cashledger -m 0640 "$RESET_SRC" "$RESET"
fi
/usr/bin/node --check "$RESET"
/usr/bin/node --check "$BACKUP_SRC"
echo "2/7 Read-only live finance inventory and safety checks"
runuser -u cashledger -- /usr/bin/node --env-file="$ENV" "$RESET" --inspect

echo "3/7 Temporarily pause only the new client Cash Ledger API to prevent writes"
STOPPED=false
restore_services(){
 local status=$?
 if [[ "$STOPPED" == true ]]; then
   echo "Starting the client Cash Ledger API after reset attempt..."
   systemctl start "$API" || true
   systemctl start "$WEB" || true
 fi
 if [[ "$status" != 0 ]]; then
   echo "RESET NOT CONFIRMED. Preserve backups and review output before retrying."
 fi
}
trap restore_services EXIT
systemctl stop "$API"
STOPPED=true
systemctl is-active --quiet "$API" && { echo "REFUSED: API still running"; exit 1; }

echo "4/7 Create and fully validate a NEW pre-reset client PostgreSQL backup"
 /usr/bin/node --env-file="$ENV" "$BACKUP_SRC"
[[ -s "$BACKUP" ]] || { echo "REFUSED: no completed backup"; exit 1; }
BACKUP_SHA="$(sha256sum "$BACKUP" | cut -d' ' -f1)"
[[ "$BACKUP_SHA" =~ ^[a-f0-9]{64}$ ]] ||
 { echo "REFUSED: invalid backup SHA256"; exit 1; }

echo "5/7 Apply the approved Option A financial-only reset as one DB transaction"
runuser -u cashledger -- env \
  CASHLEDGER_FINANCIAL_RESET_APPROVED=YES_RESET_CLIENT_FINANCIAL_ONLY \
  CASHLEDGER_RESET_BACKUP_SHA256="$BACKUP_SHA" \
  /usr/bin/node --env-file="$ENV" "$RESET" --apply

echo "6/7 Verify all 35 financial tables are cleared and all master data survived"
runuser -u cashledger -- /usr/bin/node --env-file="$ENV" "$RESET" --verify

echo "7/7 Restore client services, confirm HTTPS and API/database health"
systemctl start "$API"
systemctl start "$WEB"
ready=false
for attempt in $(seq 1 35); do
  api="$(curl -s --max-time 4 -o /dev/null -w '%{http_code}' http://127.0.0.1:4001/api/health || true)"
  login="$(curl -s --max-time 4 -o /dev/null -w '%{http_code};%{ssl_verify_result}' https://ledger.bestmoney.in/login || true)"
  if [[ "$api" == 200 && "$login" == '200;0' ]] &&
     systemctl is-active --quiet "$API" && systemctl is-active --quiet "$WEB"; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || { echo "ERROR: post-reset client API/web not healthy"; exit 1; }
STOPPED=false
trap - EXIT
echo "SUCCESS: NEW client Cash Ledger Option A financial reset completed."
echo "PASS: all 33 account openings reset to INR 0; all financial and cash-session tables empty."
echo "PASS: customers, saved card details, account names, settings, user accounts preserved."
echo "PASS: historical audit trail and a new financial reset audit record retained."
echo "PASS: pre-reset backup stored at $BACKUP (SHA256 $BACKUP_SHA)."
echo "PASS: new client API/web healthy; old demo and unrelated VPS services untouched."
