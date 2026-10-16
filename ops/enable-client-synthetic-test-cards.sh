#!/usr/bin/env bash
# Explicitly approved synthetic 16-digit test cards on NEW Cash Ledger client VPS.
# Enables existing app workflow; no source/data migration or unrelated service changes.
set -euo pipefail
umask 077

if [[ "$(id -u)" != 0 || "$(hostname)" != "srv2067503" ]]; then
  echo "REFUSED: run as root only on new client VPS srv2067503"; exit 1
fi
ENV=/etc/cashledger/cashledger.env
UNIT=cashledger-api-client.service
CURRENT=/var/www/cashledger/current
BACKUP=/etc/cashledger/cashledger.env.before-synthetic-cards-20261016
exec 9>/run/lock/cashledger-synthetic-card-activation.lock
flock -n 9 || { echo "REFUSED: another activation is running"; exit 1; }

[[ -f "$ENV" && ! -L "$ENV" ]] || { echo "REFUSED: expected regular protected production environment"; exit 1; }
[[ -f "$CURRENT/api/node_modules/@prisma/client/index.js" ]] || { echo "REFUSED: unexpected deployed API"; exit 1; }
systemctl is-active --quiet "$UNIT" || { echo "REFUSED: client API service not active"; exit 1; }
[[ "$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' http://127.0.0.1:4001/api/health)" == 200 ]] ||
  { echo "REFUSED: client API unhealthy before activation"; exit 1; }

# Parse only nonsecret target fields; never source a DATABASE_URL containing '&'.
python3 - "$ENV" <<'PY'
import os,re,sys,stat,grp
from pathlib import Path
p=Path(sys.argv[1]);st=p.stat()
if not stat.S_ISREG(st.st_mode) or st.st_uid!=0 or (st.st_mode&0o007):
    sys.exit("REFUSED: environment ownership or access permissions unexpected")
lines=p.read_text().splitlines()
values={}
for line in lines:
    m=re.match(r'^([A-Za-z_][A-Za-z_0-9]*)=(.*)$',line)
    if m:
        k,v=m.groups()
        if k in values:sys.exit("REFUSED: duplicate environment variable "+k)
        values[k]=v.strip().strip('"').strip("'")
if values.get('WEB_ORIGIN')!='https://ledger.bestmoney.in' or values.get('NODE_ENV')!='production':
    sys.exit("REFUSED: environment is not the expected client production environment")
if values.get('DEMO_CARD_ENCRYPTION_KEY') and not re.fullmatch('[0-9a-fA-F]{64}',values['DEMO_CARD_ENCRYPTION_KEY']):
    sys.exit("REFUSED: an existing synthetic card encryption key has unexpected format")
print("PASS: protected production environment and optional existing card key checked.")
PY

# Refuse generating a NEW encryption key if stored synthetic cards already exist:
# that would make previous encrypted demo cards impossible to decrypt.
SYNTHETIC_ROWS="$(runuser -u cashledger -- /usr/bin/node --env-file="$ENV" -e '
const {PrismaClient}=require("/var/www/cashledger/current/api/node_modules/@prisma/client");
const p=new PrismaClient();
p.customerDemoCard.count().then(n=>console.log(n)).catch(e=>{console.error("Card count preflight failed");process.exitCode=1}).finally(()=>p.$disconnect());
')"
[[ "$SYNTHETIC_ROWS" =~ ^[0-9]+$ ]] || { echo "REFUSED: unexpected stored-card count"; exit 1; }
echo "PASS: stored synthetic card record count checked."

# Secure atomic env update. Never print generated encryption key.
# State marker file records whether a change was required, never contains secrets.
STATE="$(mktemp /run/lock/cashledger-synthetic-state.XXXXXXXX)"
chmod 0600 "$STATE"
trap 'rm -f "$STATE"' EXIT

python3 - "$ENV" "$BACKUP" "$STATE" "$SYNTHETIC_ROWS" <<'PY'
from pathlib import Path
import os,grp,re,stat,secrets,sys,tempfile
target,backup,marker=map(Path,sys.argv[1:4])
rows=int(sys.argv[4])
raw=target.read_bytes()
lines=raw.decode('utf-8').splitlines()
indexes={}
for idx,line in enumerate(lines):
    m=re.match(r'^([A-Za-z_][A-Za-z_0-9]*)=',line)
    if m:
        k=m.group(1)
        if k in indexes:sys.exit("REFUSED: duplicate environment variable "+k)
        indexes[k]=idx
existing=lines[indexes['DEMO_CARD_ENCRYPTION_KEY']].split('=',1)[1].strip().strip('"').strip("'") if 'DEMO_CARD_ENCRYPTION_KEY' in indexes else ''
if existing and not re.fullmatch(r'[0-9a-fA-F]{64}',existing):
    sys.exit("REFUSED: existing encryption key is invalid")
if rows>0 and not existing:
    sys.exit("REFUSED: stored synthetic card rows exist but previous encryption key is missing")
flag=lines[indexes['DEMO_CARD_COPY_ENABLED']].split('=',1)[1].strip().strip('"').strip("'") if 'DEMO_CARD_COPY_ENABLED' in indexes else ''
if flag=='true' and existing:
    marker.write_text('already_enabled')
    print("PASS: synthetic 16-digit test-card mode already configured.")
    sys.exit(0)
if backup.exists():
    sys.exit("REFUSED: the pre-enablement backup already exists, but live config differs. Review it manually.")
backup.write_bytes(raw)
os.chown(backup,0,grp.getgrnam('cashledger').gr_gid)
backup.chmod(stat.S_IMODE(target.stat().st_mode))
def assign(k,v):
    if k in indexes:lines[indexes[k]]=k+'='+v
    else:lines.append(k+'='+v)
assign('DEMO_CARD_ENCRYPTION_KEY',existing or secrets.token_hex(32))
assign('DEMO_CARD_COPY_ENABLED','true')
fd,name=tempfile.mkstemp(prefix='.cashledger.env.synthetic.',dir=str(target.parent))
try:
    os.fchmod(fd,stat.S_IMODE(target.stat().st_mode))
    os.fchown(fd,0,grp.getgrnam('cashledger').gr_gid)
    with os.fdopen(fd,'wb') as f:
        f.write(('\n'.join(lines)+'\n').encode());f.flush();os.fsync(f.fileno())
    os.replace(name,target)
except:
    try:os.unlink(name)
    except OSError:pass
    raise
marker.write_text('changed')
print("PASS: synthetic test-card mode set; AES-256-GCM key kept secret.")
PY

restore_previous_env() {
  if [[ "$(cat "$STATE")" == changed ]]; then
    echo "Activation failed: restoring the original protected Cash Ledger environment."
    cp -p -- "$BACKUP" "$ENV" || true
    systemctl restart "$UNIT" || true
  fi
  echo "STOP: inspect the failure before retrying."
}
trap restore_previous_env ERR

echo "Restarting ONLY the client Cash Ledger API to load test-card settings..."
systemctl restart "$UNIT"
ready=false
for attempt in $(seq 1 30); do
  if systemctl is-active --quiet "$UNIT" &&
      [[ "$(curl -s --max-time 3 -o /dev/null -w '%{http_code}' http://127.0.0.1:4001/api/health || true)" == 200 ]]; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || { echo "REFUSED: API did not become healthy"; false; }

python3 - "$ENV" "$(systemctl show -p MainPID --value "$UNIT")" <<'PY'
import os,re,sys
from pathlib import Path
env=Path(sys.argv[1]).read_text().splitlines()
get=lambda key:next((x.partition('=')[2].strip().strip('"').strip("'") for x in env if x.startswith(key+'=')),None)
pid=int(sys.argv[2])
if pid<2:sys.exit("REFUSED: invalid API process ID")
actual=Path('/proc/%d/environ'%pid).read_bytes().split(b'\0')
loaded={}
for item in actual:
    k,sep,v=item.partition(b'=')
    if sep and k in (b'DEMO_CARD_COPY_ENABLED',b'DEMO_CARD_ENCRYPTION_KEY'):
        loaded[k.decode()]=v.decode()
if loaded.get('DEMO_CARD_COPY_ENABLED')!='true' or loaded.get('DEMO_CARD_ENCRYPTION_KEY')!=get('DEMO_CARD_ENCRYPTION_KEY'):
    sys.exit("REFUSED: active API process does not have the correct synthetic-card settings")
print("PASS: running API has synthetic test-card mode enabled and encryption key loaded.")
PY

[[ "$(curl -sS --max-time 12 -o /dev/null -w '%{http_code};%{ssl_verify_result}' https://ledger.bestmoney.in/login)" == '200;0' ]] ||
 { echo "REFUSED: external login/HTTPS health check failed"; false; }
[[ "$(curl -sS --max-time 12 -o /dev/null -w '%{http_code}' https://ledger.bestmoney.in/api/customers/demo-card-availability)" == 401 ]] ||
 { echo "REFUSED: synthetic card feature no longer requires authentication"; false; }
trap - ERR
echo "SUCCESS: 16-digit synthetic test-card Add/Edit/View/Copy enabled on NEW client server."
echo "URL: https://ledger.bestmoney.in/login"
echo "Access: existing authenticated Cash Ledger users; normal audit/encryption protections retained."
echo "Old VPS and unrelated VPS applications unchanged. No financial records modified."
