'use strict';
// Root-only backup before the client VPS opening-balance feature cutover.
// Never overwrite or print credentials. This is NOT a migration.
const fs=require('node:fs');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const rev=process.argv[2];
if(process.getuid()!==0)throw Error('REFUSED: root required');
if(!/^[0-9a-f]{40}$/.test(rev||''))throw Error('REFUSED: full revision hash required');
const u=new URL(process.env.DATABASE_URL||'about:blank');
if(u.protocol!=='postgresql:'||u.hostname!=='127.0.0.1'||u.port!=='5432'||
 u.username!=='cashledger_app'||u.pathname!=='/cashledger_prod'||
 u.searchParams.get('schema')!=='public'||process.env.NODE_ENV!=='production'||
 process.env.WEB_ORIGIN!=='https://ledger.bestmoney.in')
 throw Error('REFUSED: unexpected client DB identity');
const backup='/etc/cashledger/migration/client-before-opening-balance-'+rev.slice(0,10)+'.dump';
if(fs.existsSync(backup))throw Error('REFUSED: backup already exists; do not overwrite');
const fd=fs.openSync(backup,'wx',0o600);fs.closeSync(fd);
const env={...process.env,PGPASSWORD:decodeURIComponent(u.password)};
const args=['-h','127.0.0.1','-p','5432','-U','cashledger_app','-d','cashledger_prod',
 '--schema=public','--no-owner','--no-acl','-Fc','-f',backup];
const out=spawnSync('/usr/bin/pg_dump',args,{env,encoding:'utf8',maxBuffer:400000,timeout:120000});
if(out.status!==0||out.error){
 console.error('REFUSED: client backup failed. Partial file retained for inspection.');
 console.error((out.stderr||'').slice(0,450));process.exit(1);
}
const check=spawnSync('/usr/bin/pg_restore',['-l',backup],
 {encoding:'utf8',maxBuffer:2000000,timeout:120000});
if(check.status!==0||check.error||fs.statSync(backup).size<10000)
 throw Error('REFUSED: backup verification failed');
const sha=crypto.createHash('sha256').update(fs.readFileSync(backup)).digest('hex');
console.log('PASS: protected client DB pre-release backup verified');
console.log('BACKUP: '+backup);
console.log('BYTES: '+fs.statSync(backup).size);
console.log('SHA256: '+sha);
