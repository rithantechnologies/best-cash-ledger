#!/usr/bin/env bash
# Root-owned deployment worker. Runs ONLY through cashledger-client-deploy.service.
# Only touches /var/www/cashledger/current, the staged Cash Ledger release,
# client backup directory and the TWO cashledger-*-client services.
set -euo pipefail
umask 077
[[ "$(id -u)" == 0 && "$(hostname)" == srv2067503 ]] ||
 { echo 'REFUSED: expected new client root service'; exit 1; }
exec 9>/run/lock/cashledger-managed-release.lock
flock -n 9 || { echo 'REFUSED: another managed Cash Ledger release is running'; exit 1; }

BASE=/var/www/cashledger
REPO=/home/cashdeploy/cashledger-source
REQUEST=/home/cashdeploy/cashledger-release-request
LINK="$BASE/current"
API=cashledger-api-client.service
WEB=cashledger-web-client.service
ENV=/etc/cashledger/cashledger.env
BACKUP_HELPER=/usr/local/libexec/cashledger/client-backup.cjs

[[ -f "$REQUEST" && ! -L "$REQUEST" &&
    "$(stat -c %U "$REQUEST")" == cashdeploy ]] ||
 { echo 'REFUSED: missing/nonstandard cashdeploy release request'; exit 1; }
revision="$(cat "$REQUEST")"
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] ||
 { echo 'REFUSED: expected exactly one full Git SHA-1 revision'; exit 1; }
[[ "$(git -c safe.directory="$REPO" -C "$REPO" branch --show-current)" == main ]] ||
 { echo 'REFUSED: repository is not on main'; exit 1; }
[[ -z "$(git -c safe.directory="$REPO" -C "$REPO" status --porcelain)" ]] ||
 { echo 'REFUSED: uncommitted changes in source checkout'; exit 1; }
git -c safe.directory="$REPO" -C "$REPO" merge-base --is-ancestor "$revision" main ||
 { echo 'REFUSED: requested revision is not committed on main'; exit 1; }

RELEASE="$BASE/releases/$revision-bestmoney-managed"
# One existing prebuilt release was staged before deployment authorization.
if [[ "$revision" == 2504928ec69fa92d8ec112b2b0c609fcd554625d ]]; then
  RELEASE="$BASE/releases/2504928-opening-balances"
fi
[[ -d "$RELEASE" && ! -L "$RELEASE" &&
    "$(readlink -f "$RELEASE")" == "$RELEASE" ]] ||
 { echo 'REFUSED: staged release directory is missing/linked'; exit 1; }
[[ "$(cat "$RELEASE/REVISION")" == "$revision" ]] ||
 { echo 'REFUSED: stage does not match requested committed revision'; exit 1; }
[[ "$(stat -c %U "$RELEASE")" == cashdeploy ||
    "$(stat -c %U "$RELEASE")" == cashledger ]] ||
 { echo 'REFUSED: unexpected staged release owner'; exit 1; }
for artifact in api/dist/main.js api/dist/accounts/accounts.service.js \
   api/dist/accounts/accounts.controller.js api/package.json \
   api/prisma/schema.prisma web/apps/web/server.js \
   web/apps/web/.next/BUILD_ID; do
  [[ -s "$RELEASE/$artifact" ]] || { echo "REFUSED: missing $artifact"; exit 1; }
done
[[ -d "$RELEASE/api/node_modules/@prisma/client" &&
    -d "$RELEASE/web/apps/web/.next/static" &&
    -d "$RELEASE/web/apps/web/public" ]] ||
 { echo 'REFUSED: staged runtime dependency/static assets incomplete'; exit 1; }
[[ -f "$ENV" && ! -L "$ENV" && -f "$BACKUP_HELPER" ]] ||
 { echo 'REFUSED: client env or immutable backup helper unavailable'; exit 1; }
for svc in "$API" "$WEB" postgresql.service nginx.service; do
  systemctl is-active --quiet "$svc" ||
   { echo "REFUSED: service not healthy before deployment: $svc"; exit 1; }
done
current="$(readlink -f "$LINK")"
[[ "$current" == "$BASE/releases/"* && -d "$current" ]] ||
 { echo 'REFUSED: live release points outside Cash Ledger releases'; exit 1; }
if [[ "$current" == "$RELEASE" ]]; then
  echo "ALREADY LIVE: $revision"; exit 0
fi
[[ "$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' http://127.0.0.1:4001/api/health)" == 200 ]] ||
 { echo 'REFUSED: current API health failed'; exit 1; }
[[ "$(curl -sS --max-time 8 -o /dev/null -w '%{http_code};%{ssl_verify_result}' https://ledger.bestmoney.in/login)" == '200;0' ]] ||
 { echo 'REFUSED: current HTTPS login failed'; exit 1; }
node --check "$RELEASE/api/dist/main.js"
node --check "$RELEASE/web/apps/web/server.js"

echo 'Backing up only the client cashledger_prod database'
backup="/etc/cashledger/migration/client-before-opening-balance-${revision:0:10}.dump"
if [[ -e "$backup" ]]; then
  [[ -f "$backup" && ! -L "$backup" ]] ||
    { echo 'REFUSED: unsafe existing backup filename'; exit 1; }
  /usr/bin/pg_restore -l "$backup" >/dev/null
  echo 'PASS: verified an existing protected pre-release backup'
else
  /usr/bin/node --env-file="$ENV" "$BACKUP_HELPER" "$revision"
fi

echo 'Activating only Cash Ledger API and web'
chown -hR cashledger:cashledger "$RELEASE"
tmp="$BASE/.managed-switch-${revision:0:12}"
[[ ! -e "$tmp" && ! -L "$tmp" ]] ||
 { echo 'REFUSED: unexpected pending Cash Ledger symlink'; exit 1; }
changed=false
rollback() {
  local status=$?
  set +e
  if [[ "$changed" == true ]]; then
    echo "ROLLBACK: reverting Cash Ledger to $current"
    local restored="$BASE/.managed-rollback-${revision:0:12}"
    if [[ ! -e "$restored" && ! -L "$restored" ]]; then
      ln -s "$current" "$restored" && mv -Tf "$restored" "$LINK"
    fi
    systemctl restart "$API"
    systemctl restart "$WEB"
  fi
  echo "FAILED: deployment status $status, examine client service logs"
  exit "$status"
}
trap rollback ERR
ln -s "$RELEASE" "$tmp"
mv -Tf "$tmp" "$LINK"
changed=true
systemctl restart "$API"
systemctl restart "$WEB"
healthy=false
for i in $(seq 1 35); do
  apicode="$(curl -s --max-time 3 -o /dev/null -w '%{http_code}' http://127.0.0.1:4001/api/health || true)"
  webcode="$(curl -s --max-time 3 -o /dev/null -w '%{http_code};%{ssl_verify_result}' https://ledger.bestmoney.in/login || true)"
  authcode="$(curl -s --max-time 3 -o /dev/null -w '%{http_code}' \
    -X PATCH -H 'Content-Type: application/json' -d '{"openingBalance":0}' \
    https://ledger.bestmoney.in/api/accounts/unauthed-check/opening-balance || true)"
  if [[ "$apicode" == 200 && "$webcode" == '200;0' && "$authcode" == 401 ]] &&
    systemctl is-active --quiet "$API" && systemctl is-active --quiet "$WEB"; then
    healthy=true; break
  fi
  sleep 1
done
[[ "$healthy" == true && "$(readlink -f "$LINK")" == "$RELEASE" ]] ||
 { echo "FAILED: health check api=$apicode web=$webcode auth=$authcode"; false; }
changed=false
trap - ERR
echo "SUCCESS: deployed $revision to https://ledger.bestmoney.in/"
echo 'Previous Cash Ledger release and unrelated VPS services left intact.'
