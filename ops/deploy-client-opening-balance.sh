#!/usr/bin/env bash
# Root-only, targeted deployment of the already-staged, versioned Client Cash Ledger
# opening-balance release. Does not alter any unrelated VPS service or old demo.
set -euo pipefail
umask 077

REPO=/home/cashdeploy/cashledger-source
BASE=/var/www/cashledger
LINK=$BASE/current
OLD=$BASE/releases/058a442ac981f59fe6bf19cc9823e6c1753ea8bc-bestmoney-root
ENV=/etc/cashledger/cashledger.env
API=cashledger-api-client.service
WEB=cashledger-web-client.service
BACKUP_DIR=/etc/cashledger/migration

if [[ "$(id -u)" != 0 || "$(hostname)" != 'srv2067503' ]]; then
  echo "REFUSED: run as root on NEW client VPS srv2067503 only"
  exit 1
fi
exec 9>/run/lock/cashledger-client-opening-balance-deploy.lock
flock -n 9 || { echo 'REFUSED: Cash Ledger deployment already in progress'; exit 1; }

REV=$(git -c safe.directory="$REPO" -C "$REPO" rev-parse HEAD)
[[ "$(git -c safe.directory="$REPO" -C "$REPO" branch --show-current)" == main ]] ||
  { echo 'REFUSED: source is not on main'; exit 1; }
[[ -z "$(git -c safe.directory="$REPO" -C "$REPO" status --porcelain)" ]] ||
  { echo 'REFUSED: uncommitted source changes'; exit 1; }
RELEASE="$BASE/releases/$REV-bestmoney-opening-balance"
[[ -d "$RELEASE/api/dist" && -f "$RELEASE/web/apps/web/server.js" ]] ||
  { echo "REFUSED: staged release missing: $RELEASE"; exit 1; }
[[ "$(cat "$RELEASE/REVISION")" == "$REV" ]] ||
  { echo 'REFUSED: release revision does not match Git main'; exit 1; }
[[ -f "$ENV" && ! -L "$ENV" ]] ||
  { echo 'REFUSED: protected client API environment missing'; exit 1; }
[[ "$(readlink -f "$LINK")" == "$OLD" ]] ||
  { echo 'REFUSED: live symlink changed; do not replace an unexpected release'; exit 1; }
for svc in postgresql.service nginx.service "$API" "$WEB"; do
  systemctl is-active --quiet "$svc" ||
    { echo "REFUSED: required service is not active: $svc"; exit 1; }
done
[[ "$(curl -fsS --max-time 10 http://127.0.0.1:4001/api/health | grep -c 'connected')" -ge 1 ]] ||
  { echo 'REFUSED: production DB/API unhealthy before deployment'; exit 1; }
[[ "$(curl -sS --max-time 10 -o /dev/null -w '%{http_code};%{ssl_verify_result}' https://ledger.bestmoney.in/login)" == '200;0' ]] ||
  { echo 'REFUSED: client HTTPS login unhealthy before deployment'; exit 1; }

echo 'Step 1: validate staged release'
node --check "$RELEASE/api/dist/main.js"
node --check "$RELEASE/web/apps/web/server.js"
grep -q "opening-balance" "$RELEASE/api/dist/accounts/accounts.controller.js" ||
  { echo 'REFUSED: new Owner-only endpoint missing in staged API'; exit 1; }
grep -q "RoleName.OWNER" "$RELEASE/api/dist/accounts/accounts.controller.js" ||
  { echo 'REFUSED: Owner permission missing in new controller'; exit 1; }
[[ -s "$RELEASE/web/apps/web/.next/BUILD_ID" ]] ||
  { echo 'REFUSED: web build ID missing'; exit 1; }
[[ -d "$RELEASE/web/apps/web/.next/static" && -d "$RELEASE/web/apps/web/public" ]] ||
  { echo 'REFUSED: web static assets missing'; exit 1; }

echo 'Step 2: create fresh root-only PostgreSQL backup (no overwrites)'
[[ -d "$BACKUP_DIR" ]] || { echo 'REFUSED: protected backup folder missing'; exit 1; }
/usr/bin/node --env-file="$ENV" "$REPO/ops/backup-client-before-opening-balance-release.cjs" "$REV"

echo 'Step 3: give only staged client release access to cashledger service'
chown -R cashledger:cashledger "$RELEASE"
# All nested generated files are created for the dedicated runtime user.
# Do not modify /etc, old releases, unrelated apps, or shared services.

changed=false
restore_previous_client_release() {
  local result=$?
  if [[ "$changed" == true ]]; then
    echo 'Deployment validation failed. Restoring previous client release...'
    ln -s "$OLD" "$LINK.rollback.$$"
    mv -Tf "$LINK.rollback.$$" "$LINK" || true
    systemctl restart "$API" || true
    systemctl restart "$WEB" || true
    changed=false
  fi
  echo "Deployment stopped with status $result. Previous release preserved."
}
trap restore_previous_client_release ERR

echo 'Step 4: atomically switch ONLY /var/www/cashledger/current'
ln -s "$RELEASE" "$LINK.opening-balance.$$"
mv -Tf "$LINK.opening-balance.$$" "$LINK"
changed=true
systemctl restart "$API"
systemctl restart "$WEB"

echo 'Step 5: smoke-test API, web and authentication boundary'
healthy=false
for attempt in $(seq 1 35); do
  api=$(curl -s --max-time 4 http://127.0.0.1:4001/api/health || true)
  web=$(curl -s --max-time 4 -o /dev/null -w '%{http_code};%{ssl_verify_result}' https://ledger.bestmoney.in/login || true)
  endpoint=$(curl -s --max-time 4 -o /dev/null -w '%{http_code}' -X PATCH \
    -H 'Content-Type: application/json' -d '{"openingBalance":50000}' \
    https://ledger.bestmoney.in/api/accounts/unauthed-test/opening-balance || true)
  if systemctl is-active --quiet "$API" && systemctl is-active --quiet "$WEB" &&
     [[ "$api" == *'"database":"connected"'* ]] && [[ "$web" == '200;0' ]] &&
     [[ "$endpoint" == '401' ]]; then
    healthy=true
    break
  fi
  sleep 1
done
[[ "$healthy" == true ]] ||
  { echo "ERROR: client deployment smoke failed; API=$api WEB=$web AUTH=$endpoint"; false; }
[[ "$(readlink -f "$LINK")" == "$RELEASE" ]] ||
  { echo 'ERROR: release link does not match staged code'; false; }

changed=false
trap - ERR
echo 'SUCCESS: Owner-only Opening Balance feature DEPLOYED on new client VPS.'
echo 'URL: https://ledger.bestmoney.in/accounts'
echo "Live release: $REV"
echo 'Previous client release preserved for rollback; old demo and unrelated VPS services untouched.'
echo 'Account names and balances unchanged until the Owner explicitly saves an opening amount.'
