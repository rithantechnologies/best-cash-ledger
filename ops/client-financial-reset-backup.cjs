'use strict';
// Create exactly one immutable, root-only pre-reset backup of the client DB.
const fs=require('node:fs');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const path='/etc/cashledger/migration/client-before-financial-reset-20261016.dump';
if(process.getuid()!==0)throw Error('REFUSED: root required');
if(fs.existsSync(path))throw Error('REFUSED: backup already exists; no overwrite allowed');
const u=new URL(process.env.DATABASE_URL||'about:blank');
if(u.protocol!=='postgresql:'||u.hostname!=='127.0.0.1'||u.port!=='5432'||
 u.username!=='cashledger_app'||u.pathname!=='/cashledger_prod'||
 u.searchParams.get('schema')!=='public'||process.env.NODE_ENV!=='production'||
 process.env.WEB_ORIGIN!=='https://ledger.bestmoney.in')
 throw Error('REFUSED: unexpected production DB target');
const args=['-h','127.0.0.1','-p','5432','-U','cashledger_app','-d','cashledger_prod',
 '--schema=public','--no-owner','--no-acl','-Fc','-f',path];
const f=fs.openSync(path,'wx',0o600);fs.closeSync(f);
const result=spawnSync('/usr/bin/pg_dump',args,{
 env:{...process.env,PGPASSWORD:decodeURIComponent(u.password)},
 encoding:'utf8',maxBuffer:1000000,timeout:120000
});
if(result.error||result.status!==0) {
 console.error('REFUSED: pg_dump failed; partial archive retained for investigation.');
 console.error((result.stderr||'').slice(0,500));
 process.exit(1);
}
const check=spawnSync('/usr/bin/pg_restore',['--file=/dev/null',path],{
 encoding:'utf8',maxBuffer:1000000,timeout:120000
});
if(check.error||check.status!==0) {
 console.error('REFUSED: full PostgreSQL archive decode verification failed.');
 process.exit(1);
}
if(fs.statSync(path).size<10000)throw Error('REFUSED: backup unexpectedly small');
const sha=crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
console.log('PASS: full client-only pre-reset PostgreSQL backup created and decoded successfully.');
console.log('BACKUP: '+path);
console.log('BYTES: '+fs.statSync(path).size);
console.log('SHA256: '+sha);
