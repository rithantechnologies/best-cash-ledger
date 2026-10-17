#!/usr/bin/env bash
# One-time ROOT authorization. Does not deploy, restart running apps or alter DB data.
set -euo pipefail
umask 077
[[ "$(id -u)" == 0 && "$(hostname)" == srv2067503 ]] || {
  echo 'REFUSED: use Hostinger ROOT terminal for NEW client VPS srv2067503'; exit 1;
}
SOURCE=/home/cashdeploy/cashledger-source/ops/client-deploy-auth
HELPER=/home/cashdeploy/cashledger-source/ops/backup-client-before-opening-balance-release.cjs
RULE=/etc/polkit-1/rules.d/50-cashledger-client-deploy.rules
UNIT=/etc/systemd/system/cashledger-client-deploy.service
WORKER=/usr/local/sbin/cashledger-client-deploy
BACKUP=/usr/local/libexec/cashledger/client-backup.cjs
for file in "$SOURCE/deploy-worker.sh" "$SOURCE/cashledger-client-deploy.service" "$SOURCE/50-cashledger-client-deploy.rules" "$HELPER"; do
  [[ -s "$file" && ! -L "$file" ]] || { echo "REFUSED: required source missing: $file"; exit 1; }
done
[[ -f /etc/cashledger/cashledger.env && -d /etc/cashledger/migration ]] ||
 { echo 'REFUSED: existing client protected environment/backup directory missing'; exit 1; }
[[ -x /usr/bin/pg_dump && -x /usr/bin/pg_restore && -x /usr/bin/node ]] ||
 { echo 'REFUSED: missing client PostgreSQL / Node prerequisites'; exit 1; }
systemctl is-active --quiet polkit.service || { echo 'REFUSED: polkit is not running'; exit 1; }
for dest in "$RULE" "$UNIT" "$WORKER" "$BACKUP"; do
  [[ ! -e "$dest" && ! -L "$dest" ]] ||
  { echo "REFUSED: existing target will not be overwritten: $dest"; exit 1; }
done
bash -n "$SOURCE/deploy-worker.sh"
node --check < "$SOURCE/50-cashledger-client-deploy.rules"
node --check "$HELPER"
install -d -o root -g root -m 0755 /usr/local/libexec/cashledger
install -o root -g root -m 0750 "$SOURCE/deploy-worker.sh" "$WORKER"
install -o root -g root -m 0750 "$HELPER" "$BACKUP"
install -o root -g root -m 0644 "$SOURCE/cashledger-client-deploy.service" "$UNIT"
install -o root -g root -m 0644 "$SOURCE/50-cashledger-client-deploy.rules" "$RULE"
systemctl daemon-reload
systemctl is-active --quiet cashledger-api-client.service
systemctl is-active --quiet cashledger-web-client.service
echo 'AUTHORIZED: cashdeploy may START only cashledger-client-deploy.service.'
echo 'No root terminal access, unrestricted sudo, or permissions for other VPS apps were granted.'
echo 'No deployment run or financial data changes were performed.'
echo 'This setup remains installed across sessions and VPS restarts.'
