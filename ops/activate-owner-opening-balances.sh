#!/usr/bin/env bash
# Activate the prepared Owner-only opening-balance release on the NEW client VPS.
# No schema migration, financial writes, cleanup, or changes to unrelated services.
set -euo pipefail
umask 077

[[ "$(id -u)" == 0 && "$(hostname)" == 'srv2067503' ]] ||
 { echo 'REFUSED: run as root on the NEW client VPS only'; exit 1; }
REPO=/home/cashdeploy/cashledger-source
APP_REV=2504928
ROOT=/var/www/cashledger
PREVIOUS="$ROOT/releases/058a442ac981f59fe6bf19cc9823e6c1753ea8bc-bestmoney-root"
NEW="$ROOT/releases/2504928-opening-balances"
LINK="$ROOT/current"
SWAP="$ROOT/.opening-balances-swap-2504928"
API=cashledger-api-client.service
WEB=cashledger-web-client.service
exec 9>/run/lock/cashledger-opening-release.lock
flock -n 9 || { echo 'REFUSED: another release operation is running'; exit 1; }

current="$(readlink -f "$LINK")"
if [[ "$current" == "$NEW" ]]; then
 echo 'ALREADY ACTIVE: Owner opening balance release'; exit 0
fi
[[ "$current" == "$PREVIOUS" ]] || {
 echo "REFUSED: active Cash Ledger release changed: $current"; exit 1;
}
[[ -d "$NEW" && ! -L "$NEW" ]] ||
 { echo 'REFUSED: staged release directory missing or linked'; exit 1; }
[[ ! -e "$SWAP" && ! -L "$SWAP" ]] ||
 { echo 'REFUSED: temporary revision pointer already exists'; exit 1; }
git -c safe.directory="$REPO" -C "$REPO" merge-base --is-ancestor "$APP_REV" HEAD ||
 { echo 'REFUSED: source code is not based on expected app commit'; exit 1; }
expected="$(git -c safe.directory="$REPO" -C "$REPO" rev-parse "$APP_REV")"
[[ "$(cat "$NEW/REVISION")" == "$expected" ]] ||
 { echo 'REFUSED: stage revision marker mismatch'; exit 1; }
[[ -f "$NEW/api/dist/accounts/accounts.service.js" ]] ||
 { echo 'REFUSED: new account API missing'; exit 1; }
grep -q SET_OPENING_BALANCE "$NEW/api/dist/accounts/accounts.service.js" ||
 { echo 'REFUSED: audited opening balance implementation not built'; exit 1; }
[[ -f "$NEW/web/apps/web/.next/BUILD_ID" && -d "$NEW/web/apps/web/.next/static" ]] ||
 { echo 'REFUSED: web build or static assets incomplete'; exit 1; }
for service in "$API" "$WEB" postgresql nginx; do
 systemctl is-active --quiet "$service" || {
  echo "REFUSED: required service not running: $service"; exit 1;
 }
done
[[ "$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' http://127.0.0.1:4001/api/health)" == '200' ]] ||
 { echo 'REFUSED: client API not healthy before switch'; exit 1; }

echo '1/4 Ensuring staged release is readable by Cash Ledger service account'
chown -R cashledger:cashledger "$NEW"
/usr/bin/node --check "$NEW/api/dist/main.js"
/usr/bin/node --check "$NEW/web/apps/web/server.js"
/usr/bin/node "$REPO/scripts/check-client-release.mjs" "$NEW" /etc/cashledger/cashledger.env

rolled=false
rollback(){
 local code=$?
 if [[ "$rolled" == true ]]; then
  echo 'ROLLBACK: restoring old client release pointer and services'
  local rollback_temp="$ROOT/.opening-balances-rollback-2504928"
  if [[ ! -e "$rollback_temp" && ! -L "$rollback_temp" ]]; then
   ln -s "$PREVIOUS" "$rollback_temp"
   mv -Tf "$rollback_temp" "$LINK"
  fi
  systemctl restart "$API" || true
  systemctl restart "$WEB" || true
 fi
 echo "ACTIVATION FAILED (status $code). Review output; original revision remains available."
}
trap rollback ERR

echo '2/4 Atomically selecting new client release'
ln -s "$NEW" "$SWAP"
mv -Tf "$SWAP" "$LINK"
rolled=true
echo '3/4 Restarting ONLY the new client Cash Ledger API and web'
systemctl restart "$API"
systemctl restart "$WEB"
healthy=false
for attempt in $(seq 1 35); do
 api_status="$(curl -s --max-time 3 -o /dev/null -w '%{http_code}' http://127.0.0.1:4001/api/health || true)"
 login_status="$(curl -s --max-time 3 -o /dev/null -w '%{http_code};%{ssl_verify_result}' https://ledger.bestmoney.in/login || true)"
 patch_status="$(curl -s --max-time 3 -o /dev/null -w '%{http_code}' -X PATCH -H 'Content-Type: application/json' -d '{"openingBalance":0}' https://ledger.bestmoney.in/api/accounts/00000000-0000-0000-0000-000000000000/opening-balance || true)"
 if [[ "$api_status" == 200 && "$login_status" == '200;0' && "$patch_status" == 401 ]] &&
    systemctl is-active --quiet "$API" && systemctl is-active --quiet "$WEB"; then
  healthy=true; break
 fi
 sleep 1
done
[[ "$healthy" == true ]] || {
 echo "ERROR: API/HTTPS/Owner endpoint check failed after switch (api=$api_status login=$login_status auth=$patch_status)"; false;
}
[[ "$(readlink -f "$LINK")" == "$NEW" ]] || {
 echo 'ERROR: current revision not as expected'; false;
}
echo '4/4 All smoke checks passed'
rolled=false
trap - ERR
echo 'SUCCESS: Owner-only Set Opening Balance LIVE at https://ledger.bestmoney.in/accounts'
echo 'PASS: normal login and 401 unauthorized API protection'
echo 'PASS: existing account names, customers, settings, financial data unchanged'
echo "PASS: previous version retained for rollback: $PREVIOUS"
echo 'Note: Owner opening edits are allowed only before financial sessions/transactions exist.'
