import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const root='/var/www/cashledger';
const apiBase='http://127.0.0.1:4002/api';
const webBase='http://127.0.0.1:3202';
const suffix=Date.now().toString(36);
const results=[];
const shotDir=root+'/logs/e2e-cash-ui-'+suffix;
fs.mkdirSync(shotDir,{recursive:true});

function pass(name,detail=''){results.push({status:'PASS',name,detail});console.log('✓',name,detail);}
function fail(name,detail=''){results.push({status:'FAIL',name,detail});throw new Error(name+(detail?': '+detail:''));}
function assert(value,name,detail=''){if(!value)fail(name,detail);pass(name,detail);}
function eq(actual,expected,name){if(Math.abs(Number(actual)-Number(expected))>.01)fail(name,'expected '+expected+', got '+actual);pass(name,String(actual));}
function denoms(amount){
  const notes=[2000,500,200,100,50,20,10,5,2,1];
  let left=Math.round(Number(amount)); const out=[];
  for(const denomination of notes){const quantity=Math.floor(left/denomination);if(quantity){out.push({denomination,quantity});left-=quantity*denomination;}}
  if(left)throw new Error('Cannot denominate '+amount); return out;
}
async function raw(path,options={},token){
  const headers=new Headers(options.headers||{});
  headers.set('content-type','application/json');
  if(token)headers.set('authorization','Bearer '+token);
  const res=await fetch(apiBase+path,{...options,headers});
  const text=await res.text(); let body=null;
  try{body=text?JSON.parse(text):null;}catch{body=text;}
  return {status:res.status,body};
}
async function request(path,options={},token){
  const res=await raw(path,options,token);
  if(res.status<200||res.status>=300)throw new Error((options.method||'GET')+' '+path+' -> '+res.status+' '+JSON.stringify(res.body));
  return res.body;
}
async function expectStatus(path,status,options={},token){
  const res=await raw(path,options,token);
  if(res.status!==status)fail('Expected HTTP '+status+' for '+path,'got '+res.status+' '+JSON.stringify(res.body));
  pass('HTTP '+status+' '+path);
  return res.body;
}
async function login(email,password){
  const body=await request('/auth/login',{method:'POST',body:JSON.stringify({email,password})});
  assert(body.accessToken,'Login '+email);
  return body;
}
const owner=await login(process.env.OWNER_EMAIL,process.env.OWNER_TEMP_PASSWORD);
const ownerToken=owner.accessToken;
async function createAccount(name,type,opening,extra={},exact=false){
  return request('/accounts',{method:'POST',body:JSON.stringify({
    accountName:exact?name:name+' '+suffix,accountType:type,
    accountNature:type==='OWNER_CREDIT_CARD'?'LIABILITY':'ASSET',
    usageType:'BUSINESS',openingBalance:opening,...extra,
  })},ownerToken);
}
async function createStaff(label){
  const email='qa.'+label.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.'+suffix+'@cashledger.local';
  const password='Q'+randomBytes(9).toString('hex')+'a1';
  const user=await request('/users',{method:'POST',body:JSON.stringify({
    fullName:'QA '+label+' '+suffix,email,password,role:'STAFF',
  })},ownerToken);
  const auth=await login(email,password);
  return {user,email,password,token:auth.accessToken};
}
const provider=await request('/providers',{method:'POST',body:JSON.stringify({
  name:'QA Provider '+suffix,providerType:'MULTI_SERVICE',
})},ownerToken);
const main=await createAccount('Main Cash Reserve','CASH',100000,{},true);
const staffCash=await createAccount('Staff Cash Drawer','CASH',0,{},true);
const bank=await createAccount('QA Bank','BANK',150000);
const upi=await createAccount('QA UPI','UPI',5000);
const wallet=await createAccount('QA Wallet','PROVIDER_WALLET',0,{providerId:provider.id});
await request('/transactions/internal-transfer',{method:'POST',body:JSON.stringify({
  sourceAccountId:bank.id,destinationAccountId:wallet.id,transferAmount:50000,chargeAmount:0,
  referenceNumber:'QA-WALLET-FUND-'+suffix,
})},ownerToken);
const staffA=await createStaff('Staff A');
const staffB=await createStaff('Staff B');
pass('Base accounts and two staff users created');
const customer=await request('/customers',{method:'POST',body:JSON.stringify({
  customerType:'REGULAR',fullName:'QA Kumar '+suffix,mobile:'9876543210',
})},ownerToken);
const customerUpi=await request('/customers/'+customer.id+'/upi',{method:'POST',body:JSON.stringify({
  accountName:customer.fullName,upiId:'qa.'+suffix+'@upi',providerName:'GPay',
})},ownerToken);
await request('/settings/commission-rules',{method:'POST',body:JSON.stringify({
  transactionType:'CASH_TRANSFER',commissionType:'PERCENTAGE',commissionRate:2,
})},ownerToken);
const categories=await request('/settings/expense-categories',{},ownerToken);
const businessCategory=categories.find(x=>x.expenseUsage!=='PERSONAL')||categories[0];
assert(businessCategory,'Business expense category available');

const mainSession=await request('/cash-counter/open',{method:'POST',body:JSON.stringify({
  cashAccountId:main.id,denominations:denoms(100000),notes:'QA main reserve open',
})},ownerToken);
eq(mainSession.openingTotal,100000,'Owner opens Main Cash Reserve');

const staffSessionA=await request('/cash-counter/open',{method:'POST',body:JSON.stringify({
  cashAccountId:staffCash.id,responsibleUserId:staffA.user.id,
  sourceCashAccountId:main.id,denominations:denoms(10000),notes:'QA issue to Staff A',
})},ownerToken);
eq(staffSessionA.openingTotal,10000,'Owner issues ₹10,000 to Staff A session');
const ownerAccounts=await request('/dashboard/accounts',{},ownerToken);
const staffAAccounts=await request('/dashboard/accounts',{},staffA.token);
assert(ownerAccounts.some(a=>a.id===main.id)&&ownerAccounts.some(a=>a.id===staffCash.id),'Owner sees Main + Staff cash accounts');
assert(!staffAAccounts.some(a=>a.id===main.id)&&staffAAccounts.some(a=>a.id===staffCash.id),'Staff sees Staff Cash Drawer only');
const ownerSummary=await request('/dashboard/summary',{},ownerToken);
const staffSummary=await request('/dashboard/summary',{},staffA.token);
eq(ownerSummary.cashBalance,100000,'Owner total cash after reserve→staff issue');
eq(staffSummary.cashBalance,10000,'Staff visible cash count after issue');
await expectStatus('/reports/accounts/'+main.id,403,{},staffA.token);
const staffMainCurrent=await request('/cash-counter/current?cashAccountId='+main.id,{},staffA.token);
assert(staffMainCurrent===null,'Staff cannot read Main Reserve current session');

async function cashTransfer(token,allocations,ref){
  return request('/transactions/cash-transfer',{method:'POST',body:JSON.stringify({
    customerId:customer.id,customerUpiAccountId:customerUpi.id,
    requestedAmount:3000,commissionMethod:'ADD_ON',commissionRate:2,
    receiptAllocations:allocations,sourceAccountId:wallet.id,
    referenceNumber:ref+'-'+suffix,
  })},token);
}
await cashTransfer(staffA.token,[{accountId:staffCash.id,amount:3060}],'QA-CASH-ALL');
await cashTransfer(staffA.token,[{accountId:staffCash.id,amount:3000},{accountId:upi.id,amount:60}],'QA-CASH-SPLIT');
await cashTransfer(staffA.token,[{accountId:upi.id,amount:3060}],'QA-UPI-ONLY');
pass('Cash transfer receipts: all-cash, cash+UPI commission, UPI-only');
await request('/transactions/expense',{method:'POST',body:JSON.stringify({
  expenseType:'BUSINESS',expenseCategoryId:businessCategory.id,amount:1000,
  paymentAccountId:staffCash.id,description:'QA Staff A cash expense',
})},staffA.token);
const liveA=await request('/cash-counter/current?cashAccountId='+staffCash.id,{},staffA.token);
eq(liveA.liveExpectedClosingTotal,15060,'Staff A expected drawer after cash in/out');
eq(liveA.liveCashIn,6060,'Staff A cash-in tally');
eq(liveA.liveCashOut,1000,'Staff A cash-out tally');
eq(liveA.commissionEarned,180,'Commission includes cash + split + UPI-only');
assert(liveA.activities.some(a=>Number(a.cashIn)===0&&Number(a.cashOut)===0&&Number(a.commissionAmount)===60),
  'UPI-only commission appears on Cash page without changing cash');

const closeA=await request('/cash-counter/'+staffSessionA.id+'/close',{method:'POST',body:JSON.stringify({
  denominations:denoms(15060),handoverToUserId:staffB.user.id,notes:'QA Staff A → Staff B',
})},staffA.token);
eq(closeA.actualClosingTotal,15060,'Staff A closes exact');
assert(closeA.nextSession?.openedById===staffB.user.id,'Same-drawer handover opens Staff B session');
const staffACurrent=await request('/cash-counter/current?cashAccountId='+staffCash.id,{},staffA.token);
assert(staffACurrent===null,'Staff A no longer sees current drawer after handover');
const staffBCurrent=await request('/cash-counter/current?cashAccountId='+staffCash.id,{},staffB.token);
eq(staffBCurrent.openingTotal,15060,'Staff B receives exact handed-over opening cash');
await request('/transactions/atm-withdrawal',{method:'POST',body:JSON.stringify({
  bankAccountId:bank.id,cashAccountId:staffCash.id,cashReceived:2000,atmCharge:20,
  referenceNumber:'QA-ATM-'+suffix,
})},staffB.token);
await request('/transactions/expense',{method:'POST',body:JSON.stringify({
  expenseType:'BUSINESS',expenseCategoryId:businessCategory.id,amount:500,
  paymentAccountId:staffCash.id,description:'QA Staff B cash expense',
})},staffB.token);
const liveB=await request('/cash-counter/current?cashAccountId='+staffCash.id,{},staffB.token);
eq(liveB.liveExpectedClosingTotal,16560,'Staff B expected drawer after ATM cash-in and expense');

await request('/cash-counter/'+closeA.nextSession.id+'/close',{method:'POST',body:JSON.stringify({
  denominations:denoms(16560),handoverToCashAccountId:main.id,notes:'QA Staff B → Main Reserve',
})},staffB.token);
const afterReturn=await request('/dashboard/accounts',{},ownerToken);
eq(afterReturn.find(a=>a.id===staffCash.id).currentBalance,0,'Staff drawer returns to zero');
eq(afterReturn.find(a=>a.id===main.id).currentBalance,106560,'Main Reserve receives Staff B close');
const companySummary=await request('/dashboard/summary',{},ownerToken);
eq(companySummary.cashBalance,106560,'Company cash total reconciles after handover');
const reopenA2=await request('/cash-counter/open',{method:'POST',body:JSON.stringify({
  cashAccountId:staffCash.id,responsibleUserId:staffA.user.id,sourceCashAccountId:main.id,
  denominations:denoms(5000),notes:'QA Staff A second same-day session',
})},ownerToken);
eq(reopenA2.openingTotal,5000,'Staff A opens second session same day');
await request('/cash-counter/'+reopenA2.id+'/close',{method:'POST',body:JSON.stringify({
  denominations:denoms(5000),handoverToCashAccountId:main.id,notes:'QA second session close',
})},staffA.token);

const reopenA3=await request('/cash-counter/open',{method:'POST',body:JSON.stringify({
  cashAccountId:staffCash.id,responsibleUserId:staffA.user.id,sourceCashAccountId:main.id,
  denominations:denoms(1000),notes:'QA variance scenario',
})},ownerToken);
await expectStatus('/cash-counter/'+reopenA3.id+'/close',400,{method:'POST',body:JSON.stringify({
  denominations:denoms(990),notes:'Intentional short close',
})},staffA.token);
const stillOpen=await request('/cash-counter/current?cashAccountId='+staffCash.id,{},staffA.token);
assert(stillOpen?.id===reopenA3.id,'Mismatch close is rejected and session stays open');
await request('/cash-counter/'+reopenA3.id+'/close',{method:'POST',body:JSON.stringify({
  denominations:denoms(1000),handoverToCashAccountId:main.id,notes:'QA exact retry',
})},staffA.token);
pass('Mismatch recovery: recount then exact close');
const ownerHistoryBeforeMainClose=await request('/cash-counter/history',{},ownerToken);
assert(ownerHistoryBeforeMainClose.filter(s=>s.cashAccountId===staffCash.id).length>=4,'Owner sees all same-day staff sessions');
const staffAHistory=await request('/cash-counter/history',{},staffA.token);
const staffBHistory=await request('/cash-counter/history',{},staffB.token);
assert(staffAHistory.every(s=>s.openedBy?.id===staffA.user.id)&&staffAHistory.length===3,'Staff A history shows only own sessions');
assert(staffBHistory.every(s=>s.openedBy?.id===staffB.user.id)&&staffBHistory.length===1,'Staff B history shows only own session');

const liveMain=await request('/cash-counter/current?cashAccountId='+main.id,{},ownerToken);
eq(liveMain.liveExpectedClosingTotal,106560,'Main Reserve expected tally before close');
await request('/cash-counter/'+mainSession.id+'/close',{method:'POST',body:JSON.stringify({
  denominations:denoms(106560),notes:'QA owner main close',
})},ownerToken);
await expectStatus('/cash-counter/open',403,{method:'POST',body:JSON.stringify({
  cashAccountId:main.id,denominations:denoms(106560),
})},staffA.token);
pass('Staff cannot open Main Cash Reserve after owner closes it');

const mainForUi=await request('/cash-counter/open',{method:'POST',body:JSON.stringify({
  cashAccountId:main.id,denominations:denoms(106560),notes:'QA UI main open',
})},ownerToken);
const staffForUi=await request('/cash-counter/open',{method:'POST',body:JSON.stringify({
  cashAccountId:staffCash.id,responsibleUserId:staffA.user.id,sourceCashAccountId:main.id,
  denominations:denoms(2000),notes:'QA UI staff open',
})},ownerToken);
eq(staffForUi.openingTotal,2000,'UI phase starts with Staff cash ₹2,000');
const require=createRequire(import.meta.url);
const puppeteer=require('/home/cashledger/.npm/_npx/4b4c857f6efdfb61/node_modules/puppeteer');
const webLog=fs.openSync(shotDir+'/web.log','a');
const web=spawn('/home/cashledger/.nvm/versions/node/v22.23.2/bin/node',
  [root+'/node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3202'],{
  cwd:root+'/apps/web',
  env:{...process.env,NEXT_DIST_DIR:'.next-e2e',NEXT_PUBLIC_BASE_PATH:'',API_ORIGIN:'http://127.0.0.1:4002'},
  stdio:['ignore',webLog,webLog],
});
process.on('exit',()=>{try{web.kill('SIGTERM');}catch{}});
let webReady=false;
for(let i=0;i<40;i++){
  try{const res=await fetch(webBase+'/login');if(res.ok){webReady=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,250));
}
assert(webReady,'Isolated E2E web server started');

const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
async function uiLogin(email,password,viewport={width:390,height:844}){
  const context=await browser.createBrowserContext();
  const page=await context.newPage(); await page.setViewport(viewport);
  await page.goto(webBase+'/login',{waitUntil:'networkidle2'});
  await page.type('input[type=email]',email); await page.type('input[type=password]',password);
  const [loginResponse]=await Promise.all([
    page.waitForResponse(response=>response.url().includes('/api/auth/login'),{timeout:20000}),
    page.click('form button:not([type="button"])'),
  ]);
  if(!loginResponse.ok()){
    const detail=await loginResponse.text().catch(()=>String(loginResponse.status()));
    fail('UI login '+email,'HTTP '+loginResponse.status()+' '+detail);
  }
  await page.waitForFunction(()=>location.pathname!='/login',{timeout:20000});
  return {context,page};
}
async function text(page){return page.evaluate(()=>document.body.innerText);}
async function noOverflow(page){return page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1);}
async function chooseSelectByOption(page,needle){
  const ok=await page.evaluate((needle)=>{
    const selects=[...document.querySelectorAll('select')];
    const select=selects.find(s=>[...s.options].some(o=>(o.textContent||'').includes(needle)));
    if(!select)return false;
    const option=[...select.options].find(o=>(o.textContent||'').includes(needle));
    select.value=option.value; select.dispatchEvent(new Event('change',{bubbles:true})); return true;
  },needle);
  if(!ok)fail('UI select option '+needle);
}
async function selectUiCustomer(page){
  const search='input[placeholder="Search name or mobile"]';
  await page.waitForSelector(search); await page.click(search);
  await page.type(search,'QA Kumar'); await new Promise(r=>setTimeout(r,350));
  const clicked=await page.evaluate(()=>{
    const buttons=[...document.querySelectorAll('button')];
    const b=buttons.find(x=>(x.textContent||'').trim().endsWith('Use'));
    if(!b)return false; b.click(); return true;
  });
  if(!clicked)fail('UI customer search result');
  await new Promise(r=>setTimeout(r,250));
}
async function fillTransferBasics(page,amount='1000'){
  await selectUiCustomer(page);
  await page.waitForSelector('input.entry-amount-input');
  await page.click('input.entry-amount-input'); await page.type('input.entry-amount-input',amount);
  await new Promise(r=>setTimeout(r,250));
  await chooseSelectByOption(page,'My UPI');
  await chooseSelectByOption(page,wallet.accountName);
  await new Promise(r=>setTimeout(r,300));
}
const staffUi=await uiLogin(staffA.email,staffA.password);
await staffUi.page.goto(webBase+'/cash-counter',{waitUntil:'networkidle2'});
let staffCashText=await text(staffUi.page);
assert(staffCashText.includes('Staff Cash Drawer'),'Staff mobile Cash page shows Staff Cash Drawer');
assert(!staffCashText.includes('Main Cash Reserve'),'Staff mobile Cash page hides Main Cash Reserve');
assert(staffCashText.includes('₹2,000')||staffCashText.includes('2,000'),'Staff mobile Cash page shows current staff count');
assert(await noOverflow(staffUi.page),'Staff Cash mobile has no horizontal overflow');
await staffUi.page.screenshot({path:shotDir+'/staff-cash-open-mobile.png',fullPage:true});

await staffUi.page.goto(webBase+'/transactions/cash-transfer',{waitUntil:'networkidle2'});
await fillTransferBasics(staffUi.page,'1000');
let transferText=await text(staffUi.page);
assert(!transferText.includes('Main Cash Reserve'),'Staff transfer UI hides Main Cash Reserve');
assert(transferText.includes('Current cash')&&transferText.includes('2,000'),'Transfer UI shows staff current cash');
assert(transferText.includes('After this receipt')&&transferText.includes('3,020'),'Transfer UI previews cash after receipt');
assert(transferText.includes('Earn')&&transferText.includes('20'),'Transfer UI shows ₹20 commission');
assert((transferText.match(/Payment flow/g)||[]).length===1,'Transfer UI has one Payment flow section');
assert(await noOverflow(staffUi.page),'Cash Transfer mobile has no horizontal overflow');
const recordState=await staffUi.page.evaluate(()=>{
  const buttons=[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null);
  const b=buttons.find(x=>(x.textContent||'').includes('Record'));
  return b?{disabled:b.disabled,height:b.getBoundingClientRect().height}:null;
});
assert(recordState&&!recordState.disabled,'Mobile Record is enabled when flow is valid');
assert(recordState.height>=44,'Mobile Record tap target is at least 44px');
await staffUi.page.screenshot({path:shotDir+'/staff-transfer-ready-mobile.png',fullPage:true});
const clickedRecord=await staffUi.page.evaluate(()=>{
  const buttons=[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null);
  const b=buttons.find(x=>(x.textContent||'').includes('Record')&&!x.disabled);
  if(!b)return false;b.click();return true;
});
assert(clickedRecord,'Staff records transfer through mobile UI');
await staffUi.page.waitForFunction(()=>location.pathname.startsWith('/transactions/')&&!location.pathname.endsWith('/cash-transfer'),{timeout:10000});
pass('Mobile Cash Transfer redirects to transaction detail');

const afterUiTx=await request('/cash-counter/current?cashAccountId='+staffCash.id,{},staffA.token);
eq(afterUiTx.liveExpectedClosingTotal,3020,'UI cash transfer updates expected drawer to ₹3,020');
eq(afterUiTx.liveCashIn,1020,'UI cash transfer adds ₹1,020 cash');
eq(afterUiTx.commissionEarned,20,'UI cash transfer adds ₹20 commission');

await staffUi.page.goto(webBase+'/cash-counter',{waitUntil:'networkidle2'});
const afterUiCashText=await text(staffUi.page);
assert(afterUiCashText.includes('3,020'),'Staff Cash page reflects ₹3,020 after UI transfer');
assert(afterUiCashText.toLowerCase().includes('commission earned')&&afterUiCashText.includes('20'),'Staff Cash page reflects UI commission');
await staffUi.page.screenshot({path:shotDir+'/staff-cash-after-transfer-mobile.png',fullPage:true});

await request('/cash-counter/'+staffForUi.id+'/close',{method:'POST',body:JSON.stringify({
  denominations:denoms(3020),handoverToCashAccountId:main.id,notes:'QA UI staff close',
})},staffA.token);
await staffUi.page.goto(webBase+'/transactions/cash-transfer',{waitUntil:'networkidle2'});
await fillTransferBasics(staffUi.page,'500');
const closedText=await text(staffUi.page);
assert(closedText.includes('Closed')&&closedText.includes('Open this drawer in Cash'),'Closed Staff drawer has clear recovery CTA');
const closedRecordDisabled=await staffUi.page.evaluate(()=>{
  const buttons=[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null);
  const b=buttons.find(x=>(x.textContent||'').includes('Record')); return b?b.disabled:null;
});
assert(closedRecordDisabled===true,'Record stays disabled when Staff cash drawer is closed');
await staffUi.page.screenshot({path:shotDir+'/staff-transfer-closed-mobile.png',fullPage:true});
const ownerUi=await uiLogin(process.env.OWNER_EMAIL,process.env.OWNER_TEMP_PASSWORD,{width:1440,height:900});
await ownerUi.page.goto(webBase+'/cash-counter',{waitUntil:'networkidle2'});
const ownerCashText=await text(ownerUi.page);
assert(ownerCashText.includes('Main Cash Reserve')&&ownerCashText.includes('Staff Cash Drawer'),'Owner desktop Cash page shows both drawers');
assert(await noOverflow(ownerUi.page),'Owner Cash desktop has no horizontal overflow');
await ownerUi.page.screenshot({path:shotDir+'/owner-cash-desktop.png',fullPage:true});

const liveMainUi=await request('/cash-counter/current?cashAccountId='+main.id,{},ownerToken);
eq(liveMainUi.liveExpectedClosingTotal,107580,'Main Reserve tally after UI scenario');
await expectStatus('/end-of-day/snapshot',400,{method:'POST'},ownerToken);
pass('End-of-Day is blocked while Main cash session is still open');
await request('/cash-counter/'+mainForUi.id+'/close',{method:'POST',body:JSON.stringify({
  denominations:denoms(107580),notes:'QA UI final main close',
})},ownerToken);
const allOwnerHistory=await request('/cash-counter/history',{},ownerToken);
assert(allOwnerHistory.filter(s=>s.cashAccountId===staffCash.id).length>=5,'Owner history retains all staff open/close sessions');
const anyOpenOwner=await request('/cash-counter/current',{},ownerToken);
assert(anyOpenOwner===null,'All cash sessions fully closed at end of E2E');
const eodStatus=await request('/end-of-day/status',{},ownerToken);
assert(eodStatus.openCashSessions===0&&eodStatus.cashReconciled===true,'End-of-Day reports cash fully reconciled');
assert(eodStatus.cashAccountsRequired===2&&eodStatus.cashAccountsReconciled===2,'End-of-Day requires and sees both cash accounts reconciled');
await expectStatus('/end-of-day/status',403,{},staffA.token);
await expectStatus('/end-of-day/history',403,{},staffA.token);
await expectStatus('/reports/end-of-day',403,{},staffA.token);
await expectStatus('/end-of-day/snapshot',403,{method:'POST'},staffA.token);
const eod=await request('/end-of-day/snapshot',{method:'POST'},ownerToken);
assert(Boolean(eod.position?.id),'Owner saves End-of-Day snapshot after reconciliation');
await expectStatus('/end-of-day/snapshot',409,{method:'POST'},ownerToken);
const eodHistory=await request('/end-of-day/history',{},ownerToken);
assert(eodHistory.some(row=>row.id===eod.position.id),'End-of-Day snapshot appears in history');

await ownerUi.context.close(); await staffUi.context.close(); await browser.close();
web.kill('SIGTERM');
fs.writeFileSync(shotDir+'/results.json',JSON.stringify({suffix,results},null,2));
console.log('SCREENSHOTS',shotDir);
console.log('CASH LIFECYCLE E2E PASS',results.length,'checks');
