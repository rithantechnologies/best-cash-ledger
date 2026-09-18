import fs from 'node:fs';
import { createRequire } from 'node:module';

const schema = 'cashledger_e2e_regression_receivables';
const require = createRequire('/var/www/cashledger/apps/api/package.json');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
await prisma.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS "' + schema + '"');
await prisma.$disconnect();

const envPath = '/var/www/cashledger/apps/api/.env';
const target = '/var/www/cashledger/apps/api/.env.e2e-regression-receivables';
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('schema', schema);
let text = fs.readFileSync(envPath, 'utf8');
text = text.replace(/^DATABASE_URL=.*$/m, 'DATABASE_URL=' + url.toString());
text = /^PORT=/m.test(text) ? text.replace(/^PORT=.*$/m, 'PORT=4002') : text + '\nPORT=4002\n';
fs.writeFileSync(target, text, { mode: 0o600 });
console.log('Fresh regression schema prepared');
