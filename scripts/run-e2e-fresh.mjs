import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

const root='/var/www/cashledger';
const api=root+'/apps/api';
const node='/home/cashledger/.nvm/versions/node/v22.23.2/bin/node';
const npx='/home/cashledger/.nvm/versions/node/v22.23.2/bin/npx';
const suite=process.argv[2];
if(!suite)throw new Error('suite script required');

function parseEnv(path){
  const out={};
  for(const raw of fs.readFileSync(path,'utf8').split(/\r?\n/)){
    const line=raw.trim();
    if(!line||line.startsWith('#'))continue;
    const i=line.indexOf('=');
    if(i<1)continue;
    const key=line.slice(0,i).trim();
    let value=line.slice(i+1).trim();
    if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'"))){
      value=value.slice(1,-1);
    }
    out[key]=value;
  }
  return out;
}
function run(cmd,args,opts={}){
  const result=spawnSync(cmd,args,{stdio:'inherit',...opts});
  if(result.status!==0)throw new Error(cmd+' '+args.join(' ')+' failed with '+result.status);
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

spawnSync('tmux',['kill-session','-t','cashledger-e2e-hardening'],{stdio:'ignore'});
run(node,[root+'/scripts/prepare-e2e-hardening.mjs'],{cwd:root});
const env={...process.env,...parseEnv(api+'/.env.e2e-hardening')};
run(npx,['prisma','migrate','deploy'],{cwd:api,env});
run(node,['prisma/seed.mjs'],{cwd:api,env});

const log=fs.openSync('/tmp/cashledger-e2e-hardening-api.log','a');
const child=spawn(node,['dist/main.js'],{
  cwd:api,env,detached:true,stdio:['ignore',log,log],
});
child.unref();
fs.writeFileSync(api+'/.e2e-hardening-api.pid',String(child.pid)+'\n',{mode:0o600});

let healthy=false;
for(let i=0;i<30;i++){
  try{
    const res=await fetch('http://127.0.0.1:4002/api/health');
    if(res.ok){healthy=true;break;}
  }catch{}
  await sleep(500);
}
if(!healthy)throw new Error('isolated API did not become healthy');

try{
  run(node,[root+'/'+suite],{cwd:root,env:{...env,TEST_DATABASE_URL:env.DATABASE_URL}});
} finally {
  try{process.kill(child.pid,'SIGTERM');}catch{}
}
