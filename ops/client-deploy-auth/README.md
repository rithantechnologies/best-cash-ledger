# Client VPS: one-time managed deployment authorization

**Target:** NEW VPS `srv2067503` and `https://ledger.bestmoney.in` only. Never use the old demo VPS.

This opt-in setup avoids giving the remote `cashdeploy` user unrestricted sudo/root access. Hostinger's root terminal installs a **root-owned immutable deployment worker** and a narrowly scoped polkit rule. The remote Desktop Commander connection can then start only `cashledger-client-deploy.service` without a password. No direct root shell is handed to the remote agent.

## One-time approval (root, new Hostinger VPS only)

```bash
bash /home/cashdeploy/cashledger-source/ops/client-deploy-auth/install-once.sh
```

The installer does not activate a release, restart running Cash Ledger, or touch any other VPS app. It refuses if an installation target already exists and does not overwrite existing configurations. On success it prints `AUTHORIZED`.

## Future changes (handled by assistant, no Hostinger commands)

1. Make the app change in `/home/cashdeploy/cashledger-source`, test API and web, commit to Git `main`, and push to origin if authorized.
2. Stage a **self-contained** release in `/var/www/cashledger/releases/<full-git-sha>-bestmoney-managed` with `api/dist`, runtime dependencies, Prisma files, IFSC data, Next standalone web, static assets and the full `REVISION` marker. Do not touch the running `current` pointer. For the initial Owner opening-balance update the prebuilt release `2504928-opening-balances` is supported as an explicit exception.
3. Record exactly the requested 40-character revision as user `cashdeploy` in `/home/cashdeploy/cashledger-release-request` (owner cashdeploy, non-symlink).
4. Invoke `systemctl start cashledger-client-deploy.service` from the existing remote connection. The root-owned worker validates request and Git revision, stage, DB/API/Web health, makes or verifies a protected **client-only** database backup, switches the client release atomically, restarts **only** its API and Web services, and checks HTTPS/authentication. If a post-switch check fails it reverts the symlink and restarts those two services.
5. Review `systemctl status cashledger-client-deploy.service` and `journalctl -u cashledger-client-deploy.service -n 80 --no-pager` before reporting success.

No manual root approval is necessary for each release. An admin can revoke permission later by removing the specifically named polkit rule (and optionally the dedicated service). The root-owned worker never executes a mutable shell script as root.

**Security:** This grants the connected `cashdeploy` account the ability to deploy executable Cash Ledger application code, so it is privileged **within the Cash Ledger application and its database**. It does **not** grant control over unrelated VPS applications or unrestricted OS privileges. Do not reuse this rule on the demo VPS.

**Limitations:** The first Hostinger-root approval cannot be performed from the current unprivileged remote connection. The initial authorization has not happened until `AUTHORIZED` is printed and the assistant independently tests a remote release.
