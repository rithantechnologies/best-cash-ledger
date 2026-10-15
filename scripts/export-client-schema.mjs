#!/usr/bin/env node
// Export ONLY the Prisma schema selected by DATABASE_URL (never the whole DB).
// Usage: node --env-file=/path/to/private.env scripts/export-client-schema.mjs /secure/output.dump
// Does not overwrite existing files, change tables, or delete anything.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, openSync, closeSync, chmodSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const target = process.argv[2] ? resolve(process.argv[2]) : '';
if (!target || !target.endsWith('.dump')) throw new Error('Provide a new output .dump filename.');
if (existsSync(target) || existsSync(target + '.sha256')) {
  throw new Error('Refusing to overwrite an existing dump or checksum.');
}
const raw = process.env.DATABASE_URL;
if (!raw) throw new Error('DATABASE_URL must come from a private environment file.');
const db = new URL(raw);
if (!['postgresql:', 'postgres:'].includes(db.protocol)) throw new Error('Only PostgreSQL is supported.');
const schema = db.searchParams.get('schema');
if (!schema || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
  throw new Error('DATABASE_URL must explicitly select a valid schema (e.g. ?schema=cashledger_client). Never dump all schemas.');
}
const database = decodeURIComponent(db.pathname.slice(1));
const username = decodeURIComponent(db.username);
if (!database || !username) throw new Error('Invalid DATABASE_URL database/user.');
const pass = decodeURIComponent(db.password);
const args = [
  '-h',db.hostname,'-p',db.port || '5432',
  '-U',username,'-d',database,'--schema='+schema,'--no-owner','--no-acl','-Fc','-f',target,
];
const env = { ...process.env, PGPASSWORD: pass };
const created = openSync(target,'wx',0o600);
closeSync(created);
console.log('Exporting only configured application schema to: ' + target);
console.log('Scope: one schema (' + schema + '), no global roles or unrelated test schemas.');
const dump = spawnSync('pg_dump',args,{env,encoding:'utf8',maxBuffer:1024*1024});
if (dump.error || dump.status !== 0) {
  console.error('pg_dump failed. Partial output may remain at ' + target);
  if (dump.stderr) console.error(dump.stderr.replaceAll(pass,'[REDACTED]').slice(0,1500));
  process.exit(1);
}
chmodSync(target,0o600);
const catalog = spawnSync('pg_restore',['-l',target],{encoding:'utf8',maxBuffer:10*1024*1024});
if (catalog.error || catalog.status !== 0) {
  console.error('pg_restore could not read dump catalog.');
  process.exit(1);
}
const stream = createReadStream(target);
const hash = createHash('sha256');
for await (const chunk of stream) hash.update(chunk);
writeFileSync(target + '.sha256',hash.digest('hex')+'  '+basename(target)+'\n',{flag:'wx',mode:0o600});
console.log('Verified catalog and wrote SHA-256 checksum. Treat dump as confidential.');
console.log('Restore into an EMPTY client database with matching schema and credentials.');
