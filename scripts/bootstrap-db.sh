#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/var/www/cashledger/apps/api/.env"
source "$ENV_FILE"
DB_ROLE="cashledger_user"
DB_NAME="cashledger_db"

if runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_ROLE'" | grep -q 1; then
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "ALTER ROLE $DB_ROLE WITH LOGIN PASSWORD '$DB_APP_PASSWORD';"
else
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "CREATE ROLE $DB_ROLE LOGIN PASSWORD '$DB_APP_PASSWORD';"
fi

if runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  echo "$DB_NAME already exists; leaving it in place."
else
  runuser -u postgres -- createdb -O "$DB_ROLE" "$DB_NAME"
fi

runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO $DB_ROLE;"
echo "Cash Ledger database bootstrap complete."
