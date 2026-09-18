import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root='/var/www/cashledger';
const apiEnv=path.join(root,'apps/api/.env');

function parseEnv(file){
  const out={};
  for(const raw of fs.readFileSync(file,'utf8').split(/\r?\n/)){
    const line=raw.trim();
    if(!line||line.startsWith('#'))continue;
    const i=line.indexOf('=');
    if(i<1)continue;
    const key=line.slice(0,i).trim();
    let value=line.slice(i+1).trim();
    if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
    out[key]=value;
  }
  return out;
}
function run(cmd,args,options={}){
  const result=spawnSync(cmd,args,{stdio:'inherit',...options});
  if(result.status!==0)throw new Error(cmd+' failed with status '+result.status);
}
function sha256(file){
  const hash=crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}
function stamp(){
  const f=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const p=Object.fromEntries(f.formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return p.year+p.month+p.day+'-'+p.hour+p.minute+p.second;
}

const kind=process.argv[2]||'automated';
const folder=path.join(root,'backups',kind+'-'+stamp());
fs.mkdirSync(folder,{recursive:true,mode:0o700});

const env=parseEnv(apiEnv);
if(!env.DATABASE_URL)throw new Error('DATABASE_URL missing');
const url=new URL(env.DATABASE_URL);
const dump=path.join(folder,'cashledger-db.dump');
const source=path.join(folder,'cashledger-source.tar.gz');
const envCopy=path.join(folder,'api.env');

run('/usr/bin/pg_dump',[
  '-h',url.hostname,'-p',url.port||'5432','-U',decodeURIComponent(url.username),
  '-d',url.pathname.slice(1),'-Fc','-f',dump,
],{env:{...process.env,PGPASSWORD:decodeURIComponent(url.password)}});

run('/usr/bin/pg_restore',['-l',dump],{stdio:['ignore','ignore','inherit']});

run('/usr/bin/tar',[
  '-czf',source,
  '--exclude=.git',
  '--exclude=node_modules',
  '--exclude=.next',
  '--exclude=dist',
  '--exclude=backups',
  '--exclude=logs',
  '--exclude=.env',
  '--exclude=.env.*',
  '--exclude=.e2e-*',
  '-C',root,'.',
]);

fs.copyFileSync(apiEnv,envCopy);
for(const file of [dump,source,envCopy])fs.chmodSync(file,0o600);

const names=['cashledger-db.dump','cashledger-source.tar.gz','api.env'];
fs.writeFileSync(
  path.join(folder,'SHA256SUMS'),
  names.map(name=>sha256(path.join(folder,name))+'  '+name).join('\n')+'\n',
  {mode:0o600},
);
fs.writeFileSync(
  path.join(folder,'MANIFEST.txt'),
  [
    'Cash Ledger backup',
    'Created: '+new Date().toISOString(),
    'Kind: '+kind,
    'Database: custom-format pg_dump verified with pg_restore -l',
    'Source archive excludes generated files, logs, backups, git metadata and env files',
    'api.env is stored separately with mode 600',
    '',
  ].join('\n'),
  {mode:0o600},
);
console.log(folder);
