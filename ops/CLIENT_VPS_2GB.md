# Cash Ledger client VPS: 2 GB profile

This profile is for a dedicated, low-traffic client VPS. Keep the application portable: Ubuntu, Node.js, PostgreSQL, Nginx and systemd only.

## Target runtime

- 2 GB RAM, 1-2 vCPU, 40 GB+ SSD/NVMe.
- 2-4 GB swap as emergency headroom.
- Node.js 22, PostgreSQL and Nginx.
- One NestJS API process and one Next.js standalone process.
- Do not build Next.js or NestJS on the production VPS.

The repository workflow `.github/workflows/build-release.yml` builds both applications on GitHub Actions and publishes a short-lived production artifact. The web artifact uses Next.js standalone output, so the VPS does not need the full frontend `node_modules` tree.

## Release layout

Use immutable release directories and keep previous releases for rollback:

```text
/var/www/cashledger/releases/<git-sha>/
/var/www/cashledger/current -> /var/www/cashledger/releases/<git-sha>
/etc/cashledger/cashledger.env
```

Do not overwrite a working release in place.

## API preparation

Inside the extracted `release/api` directory, install production dependencies, generate Prisma Client and apply migrations. Keep build tooling off the VPS.

The web release is already built and carries its traced runtime dependencies, so do not run `npm install` or `next build` for it on the VPS.

Install the client systemd units from `ops/systemd/cashledger-api-client.service` and `ops/systemd/cashledger-web-client.service`. Put the Nginx rate-limit zone in the http context and include `ops/nginx/cashledger-client-location-snippet.conf` in the HTTPS server block.

Nginx sends `/api/` directly to NestJS on port 4001 and all other requests to Next.js on port 3200. This avoids routing API traffic through the web process.

## 2 GB memory starting points

Treat these as conservative starting values, then measure:

- PostgreSQL shared_buffers: 128 MB
- PostgreSQL effective_cache_size: 768 MB
- PostgreSQL work_mem: 4 MB
- PostgreSQL maintenance_work_mem: 64 MB
- PostgreSQL max_connections: 30
- Prisma connection_limit: 5

For Prisma 6, append `connection_limit=5` to `DATABASE_URL`, preserving any existing query parameters. The systemd units cap the Node.js V8 old-space target at 384 MB per application while leaving headroom for PostgreSQL, the OS and filesystem cache.

## Deployment order

1. Extract the GitHub Actions production artifact into a new release directory.
2. Prepare API production dependencies and apply Prisma migrations.
3. Verify the environment file and database connectivity.
4. Point `/var/www/cashledger/current` at the new release.
5. Restart the two client services and run health/login checks.
6. Keep the previous release intact until the new release is verified.

## Backups

A VPS snapshot is not the only database backup. Keep a daily PostgreSQL dump outside the VPS as well. For a small Cash Ledger database, offsite backup storage should remain small.

Do not package source-code archives into every client backup; GitHub `main` is the source of truth. Back up the database, required environment/configuration and any user-uploaded files.

## Keep the server lean

Avoid Redis, Docker management panels, Prometheus/Grafana, Coolify/Dokploy and other always-on infrastructure unless the application develops a concrete need for it. Nginx + systemd + PostgreSQL is lighter and easier to migrate.
