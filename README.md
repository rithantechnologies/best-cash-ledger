# Best Cash Ledger

Manual-first cash and financial operations ledger for small agencies handling cash, banks, UPI, provider wallets, customer card settlements, AePS, customer payables and receivables, expenses, internal transfers, and end-of-day financial-position reconciliation.

## Stack

- Next.js / React / TypeScript
- NestJS / Node.js / TypeScript
- PostgreSQL
- Prisma ORM

## Structure

- `apps/web` — frontend
- `apps/api` — REST API and Prisma schema/migrations
- `scripts` — project-local operational and regression-test scripts

## Local setup

Copy the API environment example and provide your own values:

```bash
cp apps/api/.env.example apps/api/.env
```

Never commit real credentials, database dumps, backups, or production logs.

Install dependencies and build:

```bash
npm install
npm run build:api
npm run build:web
```

Apply database migrations from `apps/api`:

```bash
npx prisma migrate deploy
```

## Security

This repository intentionally excludes environment files, database dumps, backup archives, logs, generated build output, and dependency folders through `.gitignore`.

## Deployment

The current application is designed to run the API and web processes separately behind a reverse proxy. Deployment-specific credentials and server configuration should remain outside source control.
