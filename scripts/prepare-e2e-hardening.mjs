import fs from 'node:fs';
import { createRequire } from 'node:module';

const apiDir = '/var/www/cashledger/apps/api';
const envPath = apiDir + '/.env';
const target = apiDir + '/.env.e2e-hardening';
const raw = fs.readFileSync(envPath, 'utf8');

function envValue(name) {
  const match = raw.match(new RegExp('^' + name + '=(.*)$', 'm'));
  if (!match) throw new Error(name + ' missing from API env');
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

const baseUrl = envValue('DATABASE_URL');
const schema =
  'cashledger_e2e_hardening_' + Date.now().toString(36);

const require = createRequire(apiDir + '/package.json');
const { PrismaClient } = require('@prisma/client');
const root = new PrismaClient({
  datasources: { db: { url: baseUrl } },
});
await root.$executeRawUnsafe(
  'CREATE SCHEMA IF NOT EXISTS "' + schema.replaceAll('"', '""') + '"',
);
await root.$disconnect();

const url = new URL(baseUrl);
url.searchParams.set('schema', schema);
let text = raw.replace(/^DATABASE_URL=.*$/m, 'DATABASE_URL=' + url.toString());
text = /^PORT=/m.test(text)
  ? text.replace(/^PORT=.*$/m, 'PORT=4002')
  : text + '\nPORT=4002\n';
text = /^COOKIE_SECURE=/m.test(text)
  ? text.replace(/^COOKIE_SECURE=.*$/m, 'COOKIE_SECURE=false')
  : text + '\nCOOKIE_SECURE=false\n';
text = /^WEB_ORIGIN=/m.test(text)
  ? text.replace(/^WEB_ORIGIN=.*$/m, 'WEB_ORIGIN=http://127.0.0.1:3202')
  : text + '\nWEB_ORIGIN=http://127.0.0.1:3202\n';
fs.writeFileSync(target, text, { mode: 0o600 });
fs.writeFileSync(apiDir + '/.e2e-hardening-schema', schema + '\n', { mode: 0o600 });
console.log('Prepared isolated hardening schema:', schema);
