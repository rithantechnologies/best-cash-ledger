#!/usr/bin/env bash
# Deploy the prebuilt, checksum-verified customer Pay Out fix to the client VPS.
# Does not migrate data, prune releases, or restart unrelated services.
set -Eeuo pipefail
umask 077

BASE=/var/www/cashledger
REPO=/home/cashdeploy/cashledger-source
ENV=/etc/cashledger/cashledger.env
LINK="$BASE/current"
REV=5a6bf02b79176d64e5530c1dd605d873ea54fddb
PREV=914b4e4bfcd6f25c3fa1b617907ef2786ca5be41
OLD="$BASE/releases/$PREV-bestmoney-managed"
NEW="$BASE/releases/$REV-bestmoney-managed"
API=cashledger-api-client.service
WEB=cashledger-web-client.service
ARCHIVE=/home/cashdeploy/cash-ledger-5a6bf02-release.zip
DIGEST=b7779a379b9c5ac00c02e6bb58ff8aa61af0af56d815cc646ea56a76326dfdc9

[[ "$(id -u)" == 0 && "$(hostname)" == srv2067503 ]] || { echo "REFUSED: run as root on client VPS srv2067503"; exit 1; }
exec 9>/run/lock/cashledger-client-opening-balance-deploy.lock
flock -n 9 || { echo "REFUSED: a Cash Ledger deployment is already running"; exit 1; }
[[ "$(readlink -f "$LINK")" == "$OLD" ]] || { echo "REFUSED: live release changed since staging"; exit 1; }
[[ -d "$NEW" && ! -L "$NEW" && -d "$OLD/api/node_modules" ]] || { echo "REFUSED: release or live API dependencies missing"; exit 1; }
[[ "$(cat "$NEW/REVISION")" == "$REV" ]] || { echo "REFUSED: wrong release revision"; exit 1; }
[[ -f "$ENV" && ! -L "$ENV" ]] || { echo "REFUSED: client environment missing"; exit 1; }
echo "$DIGEST  $ARCHIVE" | sha256sum --check --status || { echo "REFUSED: release artifact checksum mismatch"; exit 1; }
git -c safe.directory="$REPO" -C "$REPO" diff --quiet "$PREV" "$REV" -- apps/api || { echo "REFUSED: API changed; dependencies cannot be safely reused"; exit 1; }
for service in "$API" "$WEB" nginx.service postgresql.service; do
  systemctl is-active --quiet "$service" || { echo "REFUSED: service is unhealthy: $service"; exit 1; }
done
curl -fsS --max-time 10 http://127.0.0.1:4001/api/health | grep -q '"database":"connected"' || { echo "REFUSED: database/API unhealthy"; exit 1; }
[[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://ledger.bestmoney.in/login)" == 200 ]] || { echo "REFUSED: login unhealthy"; exit 1; }
node --check "$NEW/api/dist/main.js"
node --check "$NEW/web/apps/web/server.js"

echo "Preparing isolated $REV release (old release retained)..."
if [[ ! -d "$NEW/api/node_modules" ]]; then
  cp -a "$OLD/api/node_modules" "$NEW/api/"
fi
chown -R cashledger:cashledger "$NEW"
node "$REPO/scripts/check-client-release.mjs" "$NEW" "$ENV"

swapped=false
rollback() {
  local code=$?
  trap - ERR
  if [[ "$swapped" == true ]]; then
    echo "Smoke check failed: restoring previous Cash Ledger release..."
    ln -s "$OLD" "$LINK.rollback.$$"
    mv -Tf "$LINK.rollback.$$" "$LINK"
    systemctl restart "$API" || true
    systemctl restart "$WEB" || true
  fi
  exit "$code"
}
trap rollback ERR

[[ "$(readlink -f "$LINK")" == "$OLD" ]] || { echo "REFUSED: live release changed during preparation"; exit 1; }
ln -s "$NEW" "$LINK.deploy.$$"
mv -Tf "$LINK.deploy.$$" "$LINK"
swapped=true
systemctl restart "$API"
systemctl restart "$WEB"
healthy=false
for attempt in $(seq 1 40); do
  if systemctl is-active --quiet "$API" && systemctl is-active --quiet "$WEB" &&
    curl -fsS --max-time 3 http://127.0.0.1:4001/api/health 2>/dev/null | grep -q '"database":"connected"' &&
    [[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 https://ledger.bestmoney.in/login)" == 200 ]]; then
    healthy=true
    break
  fi
  sleep 1
done
[[ "$healthy" == true && "$(readlink -f "$LINK")" == "$NEW" ]] || { echo "FAIL: post-deploy health or release check"; false; }
swapped=false
trap - ERR
echo "SUCCESS: Cash Ledger Pay Out autofill release LIVE: $REV"
echo "URL: https://ledger.bestmoney.in/login"
echo "Previous release preserved: $OLD"