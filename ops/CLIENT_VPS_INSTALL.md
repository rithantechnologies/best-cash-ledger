# Cash Ledger: portable installation checklist

This is for a dedicated client VPS. Do not change, stop, delete, or overwrite
any service or data on the existing shared VPS.

## What GitHub contains

The main branch includes the API and web source, Prisma schema, all migration
files, base-data seed, compressed IFSC bank directory, CI release packaging,
and deployment configuration templates.

Git deliberately excludes database contents, secrets, and running service state.
Reinstalling the application is separate from transferring existing client data.

## Before installing

- Provision Ubuntu, Node.js 22, PostgreSQL, Nginx, TLS, and a private DNS name.
- Create a dedicated operating-system account and PostgreSQL database owner.
- Create a secure application configuration file outside the Git checkout.
- Set DATABASE_URL, JWT_SECRET, WEB_ORIGIN, NODE_ENV, and PORT.
- Choose the correct PostgreSQL schema. Existing data may use a named schema.
- Obtain a production artifact from the GitHub Actions release workflow.

## Release preparation

1. Unpack the versioned API/Web artifact into a NEW release folder.
2. Verify API data includes the versioned compressed IFSC lookup directory.
3. Install API dependencies and generate Prisma Client.
4. Apply committed Prisma migrations to an EMPTY new application database.
5. Run the Prisma seed for roles, ledgers and application settings.
6. Set up an initial owner using temporary one-time seed credentials.
7. Run the release preflight check before switching any running service.
8. Link the new version to the current app path, then start dedicated services.
9. Configure Nginx and TLS from the versioned templates.
10. Smoke-test login, banks, cash drawers, reports and Excel download.

For the first migration/generation, install the Prisma CLI: it is declared
as a development dependency. Installing runtime-only dependencies first
will not provide that CLI.

The supplied web release has a /cashledger base path compiled at build time.
Changing that path requires rebuilding the frontend.

## Fresh database versus migrated business

For a new empty client business:
- Run the included Prisma migration set with the exact target schema.
- Initialize roles, system ledgers and owner using apps/api/prisma/seed.mjs.
- The seed recognizes OWNER_EMAIL and OWNER_TEMP_PASSWORD from the environment.
  Do not store a temporary password permanently in the application's env file.

For an existing business:
- Take a backup of the intended application's schema, not the entire database.
- Use the versioned scripts/export-client-schema.mjs with a private environment
  file. The utility requires an explicit schema in DATABASE_URL and checks the
  resulting archive. It does not overwrite existing output.
- Restore into a separate, empty database with corresponding schema and owner.
- Verify the restored migration table before deploying any newer migrations.
- Do not run the seed over customer financial data unless specifically verified.
- Never run destructive migration commands on an existing business database.

The current shared demo database includes numerous historical test schemas.
The existing scheduled whole-database backup therefore should not be treated
as a clean client migration package.

## Preflight

Use the included read-only script from your source checkout:

    node scripts/check-client-release.mjs /path/to/release /path/to/private.env

The script verifies the backend build, Prisma client and migrations, IFSC
data, frontend standalone files, revision marker, and required env settings.
It does not print credential values or modify database/application state.

## What needs human configuration

The repository does not contain or automatically provide DNS, certificates,
PostgreSQL role/password, environment secrets, client-specific providers,
initial staff accounts, financial opening balances, or historical business
data. Backups should be encrypted and stored offsite.

After deploying, check API health, bank search, initial login, customer
creation, one cash session, transaction ledgers, and a date-scoped Excel
download; also verify permissions for Owner and Staff.

## Versioned client deployment components

- .github/workflows/build-release.yml — portable compiled release
- ops/systemd/cashledger-api-client.service
- ops/systemd/cashledger-web-client.service
- ops/nginx/cashledger-rate-limit.conf
- ops/nginx/cashledger-client-location-snippet.conf
- apps/api/.env.example — variable-name starting point
- apps/api/prisma/seed.mjs — base roles and ledgers
- scripts/export-client-schema.mjs — one-schema data dump
- scripts/check-client-release.mjs — read-only deployment validation

This is a repeatable manual installation, not a one-command installer.
Do not deploy directly from dirty VPS worktrees: use a known Git commit.
