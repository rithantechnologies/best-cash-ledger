#!/usr/bin/env bash
set -euo pipefail

CONF="/etc/nginx/sites-available/rithan-demo"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="${CONF}.backup-cashledger-redirectfix-${STAMP}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script as root."
  exit 1
fi

cp -a "$CONF" "$BACKUP"
echo "Backup created: $BACKUP"

python3 - "$CONF" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()

old = r'''    location = /cashledger {
        return 301 /cashledger/;
    }
'''

new = r'''    location = /cashledger {
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

if old not in text:
    raise SystemExit("Expected Cash Ledger redirect block not found. No change made.")

path.write_text(text.replace(old, new, 1))
PY

if nginx -t; then
  systemctl reload nginx
  echo "Cash Ledger redirect loop fix applied."
else
  echo "Nginx validation failed. Restoring original config."
  cp -a "$BACKUP" "$CONF"
  nginx -t || true
  echo "Original config restored."
  exit 1
fi
