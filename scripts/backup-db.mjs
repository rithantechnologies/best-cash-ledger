import { spawnSync } from "node:child_process";

const backupFile = process.env.BACKUP_FILE;
const databaseUrl = process.env.DATABASE_URL;
if (!backupFile || !databaseUrl) throw new Error("Backup path or database URL missing");

const url = new URL(databaseUrl);
const result = spawnSync("/usr/bin/pg_dump", [
  "-h", url.hostname,
  "-p", url.port || "5432",
  "-U", decodeURIComponent(url.username),
  "-d", url.pathname.slice(1),
  "-Fc",
  "-f", backupFile,
], {
  stdio: "inherit",
  env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
});

process.exit(result.status ?? 1);
