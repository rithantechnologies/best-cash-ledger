# Cash Ledger release retention (VPS and future client servers)

`scripts/retain-releases.py` inventories *immutable runtime deployments only*. It
**never** deletes Git source/worktrees, backups, database files, user uploads,
active process directories, external-symlink targets, pinned releases, or the
newest three releases in each web/API/combined category.

**Default mode is read-only.** Automated checks should use this mode; actual
removals require an operator to review the report and invoke `--apply`.

## Initial server configuration

For the existing demo VPS, runtime builds are currently stored in
`/home/cashledger/releases`. The system also contains independently running
staging/demo instances, so do **not** use a generic `rm -rf releases/*`.

Keep an **explicit pin file** outside the releases folder, e.g.
`/home/cashledger/.cashledger-release-pins`. One directory name per line, no
paths. Pin the current web/API, desired rollbacks, and any manually managed
demo/staging release. The tool also independently protects actual running
process directories and known external symlinks. Update pins after deployments
and **before** manually cleaning up older runtime versions.

Dry-run:

```sh
python3 scripts/retain-releases.py \
  --root /home/cashledger/releases \
  --pins-file /home/cashledger/.cashledger-release-pins \
  --env-reference /var/www/cashledger/apps/api/.env \
  --min-age-days 30 --keep-latest 3
```

Manual controlled apply after reviewing the preview, during a quiet window:

```sh
python3 scripts/retain-releases.py \
  --root /home/cashledger/releases \
  --pins-file /home/cashledger/.cashledger-release-pins \
  --env-reference /var/www/cashledger/apps/api/.env \
  --min-age-days 30 --keep-latest 3 --max-delete 5 \
  --health-url http://127.0.0.1:3200/cashledger \
  --health-url http://127.0.0.1:4001/api/health \
  --apply --confirm-root /home/cashledger/releases
```

The script refuses to apply if a release was modified within 60 minutes.
It inspects process command lines, CWDs, executables, and open file handles;
scans related application/system configuration roots for symlinks; checks for
copied environment files against a known retained reference; and refuses to
remove directories containing database-like files, uploads, storage, or backups.
Deletion is capped at five directories by default, and it checks local HTTP
health before and after (when health URLs are supplied).

For a **client VPS**, supply `--root /var/www/cashledger/releases` and use the
client's separately maintained pin file, service URLs and environment
reference. Plain 7-40 character Git SHA release names are supported alongside
the demo's `cashledger-*-runtime` and `cashledger-*-stage` naming.

## Conservative recurring cleanup on existing VPS

The app owner's weekly cron runs at Sunday 04:17 server-local time. It only
deletes obsolete, fully verified runtime deployments **over 30 days old**, no
more than **two per run**. Active process references, pinned rollbacks, the
three newest web/API/combined runtime versions, protected data, installed
configuration references, and external symlinks are all exclusion rules.

The script aborts cleanup if **any** runtime directory has been modified in
the last hour, or if a local web/API health endpoint fails. It does not
restart services or modify deployment pointers. Output is appended to
`/home/cashledger/release-retention.log`. To disable this job, remove only
its `retain-releases.py` line from the `cashledger` user's crontab.

```cron
17 4 * * 0 /usr/bin/python3 /home/cashledger/worktrees/cashledger-github-main/scripts/retain-releases.py --root /home/cashledger/releases --pins-file /home/cashledger/.cashledger-release-pins --env-reference /var/www/cashledger/apps/api/.env --min-age-days 30 --keep-latest 3 --max-delete 2 --health-url http://127.0.0.1:3200/cashledger --health-url http://127.0.0.1:4001/api/health --apply --confirm-root /home/cashledger/releases >> /home/cashledger/release-retention.log 2>&1
```

For client deployments using systemd, use the **client-specific** release
root, pin file, environment reference and local health endpoints. Deployments
should take the matching `.cashledger-release-retention.lock` before changing
release pointers. The script's built-in recent-activity and process guards
still apply if a manual deploy does not take that lock.

Source-of-truth code changes belong on Git `main`; host-specific pinned
release lists live outside the repository so they can differ per client.
