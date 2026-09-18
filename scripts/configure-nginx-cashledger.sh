#!/usr/bin/env bash
set -euo pipefail

CONF="/etc/nginx/sites-available/rithan-demo"
MARKER="# Cash Ledger reverse proxy"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="${CONF}.backup-cashledger-${STAMP}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script as root."
  exit 1
fi

if [[ ! -f "$CONF" ]]; then
  echo "Nginx config not found: $CONF"
  exit 1
fi

if grep -qF "$MARKER" "$CONF"; then
  echo "Cash Ledger Nginx location is already configured."
  nginx -t
  systemctl reload nginx
  echo "Nginx configuration is valid and reloaded."
  exit 0
fi

cp -a "$CONF" "$BACKUP"
echo "Backup created: $BACKUP"

python3 - "$CONF" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()

needle = '    add_header X-Robots-Tag "noindex, nofollow, noarchive" always;'
if needle not in text:
    raise SystemExit("Expected insertion point not found; no changes made.")

block = r'''    # Cash Ledger reverse proxy
    location = /cashledger {
        return 301 /cashledger/;
    }

    location ^~ /cashledger/ {
        proxy_pass http://127.0.0.1:3200;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

'''

path.write_text(text.replace(needle, block + needle, 1))
PY

if nginx -t; then
  systemctl reload nginx
  echo "Cash Ledger published at:"
  echo "https://demo.rithantechnologies.com/cashledger/"
  echo "Existing demo root and folders were left unchanged."
else
  echo "Nginx validation failed. Restoring original config."
  cp -a "$BACKUP" "$CONF"
  nginx -t || true
  echo "Original Nginx config restored. Backup retained at: $BACKUP"
  exit 1
fi
