#!/usr/bin/env node
// Read-only client release preflight. No database writes or restarts.
// Usage: node scripts/check-client-release.mjs /path/to/release [/path/to/api.env]
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(process.argv[2] ?? '/var/www/cashledger/current');
const envPath = process.argv[3] ? resolve(process.argv[3]) : '/etc/cashledger/cashledger.env';
let errors = 0;
let warnings = 0;
function report(ok, title, detail = '', required = true) {
  console.log((ok ? 'PASS' : required ? 'FAIL' : 'WARN') + ': ' + title + (detail ? ' — ' + detail : ''));
  if (!ok) required ? errors++ : warnings++;
}
function file(rel, minimum = 1) {
  const name = join(root, rel);
  const ok = existsSync(name) && statSync(name).isFile() && statSync(name).size >= minimum;
  report(ok, rel, ok ? statSync(name).size + ' bytes' : 'missing or empty');
}
function directory(rel) {
  const name = join(root, rel);
  report(existsSync(name) && statSync(name).isDirectory(), rel);
}
console.log('Cash Ledger client release preflight (read-only)');
console.log('Release: ' + root);
file('api/dist/main.js');
file('api/dist/reports/excel-export.service.js');
file('api/package.json');
file('api/prisma/schema.prisma');
directory('api/prisma/migrations');
directory('api/node_modules/@prisma/client');
file('api/data/ifsc-branches.v2.0.62.json.gz', 100000);
file('web/apps/web/server.js');
file('web/apps/web/.next/BUILD_ID');
directory('web/apps/web/.next/static');
directory('web/apps/web/public');
const revFile = join(root, 'REVISION');
report(existsSync(revFile), 'release Git revision marker', existsSync(revFile)
  ? readFileSync(revFile, 'utf8').trim().slice(0, 12)
  : 'not present (recommended for traceability)', false);

if (existsSync(envPath)) {
  const contents = readFileSync(envPath, 'utf8');
  const data = Object.fromEntries(contents.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'))
    .map(line => { const i = line.indexOf('='); return i >= 1
      ? [line.slice(0,i).trim(),line.slice(i+1).trim().replace(/^(['"])(.*)\1$/, '$2')]
      : ['', '']; }).filter(([key]) => key));
  for (const key of ['DATABASE_URL', 'JWT_SECRET', 'WEB_ORIGIN']) {
    const value = data[key] ?? '';
    report(Boolean(value && !value.includes('CHANGE_ME')), 'environment ' + key);
  }
  report((data.JWT_SECRET ?? '').length >= 32, 'JWT_SECRET is at least 32 characters');
  report((data.NODE_ENV ?? 'production') === 'production', 'NODE_ENV production', 'May be explicitly overridden by the launcher; required on a new client VPS', false);
  try {
    const url = new URL(data.DATABASE_URL ?? '');
    report(['postgresql:', 'postgres:'].includes(url.protocol), 'PostgreSQL DATABASE_URL');
    report(Boolean(url.searchParams.get('schema')), 'explicit PostgreSQL schema',
      'Recommended for a named-schema migration', false);
  } catch {
    report(false, 'DATABASE_URL URL format');
  }
} else {
  report(false, 'environment file', envPath + ' not found (provide it as second argument)');
}
console.log('Summary: ' + errors + ' failures, ' + warnings + ' warnings');
process.exitCode = errors ? 1 : 0;
