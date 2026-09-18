const base='http://127.0.0.1:4002/api';
const email=process.env.OWNER_EMAIL;
const password=process.env.OWNER_TEMP_PASSWORD;
if(!email||!password)throw new Error('Owner credentials missing');

async function raw(path,options={},token){
  const headers=new Headers(options.headers||{});
  headers.set('content-type','application/json');
  if(token)headers.set('authorization','Bearer '+token);
  const res=await fetch(base+path,{...options,headers});
  const text=await res.text();
  let body=null;try{body=text?JSON.parse(text):null;}catch{body=text;}
  return {status:res.status,body};
}
async function request(path,options={},token){
  const r=await raw(path,options,token);
  if(r.status<200||r.status>=300)throw new Error((options.method||'GET')+' '+path+' -> '+r.status+' '+JSON.stringify(r.body));
  return r.body;
}
function assert(v,m){if(!v)throw new Error(m);}
function near(a,b,t=.01){return Math.abs(Number(a)-Number(b))<=t;}

const login=await request('/auth/login',{method:'POST',body:JSON.stringify({email,password})});
const token=login.accessToken;
const suffix=Date.now().toString(36);

async function account(name,type,nature='ASSET',openingBalance=0,extra={}){
  return request('/accounts',{method:'POST',body:JSON.stringify({
    accountName:name+' '+suffix,accountType:type,accountNature:nature,usageType:'MIXED',openingBalance,...extra,
  })},token);
}
const bank=await account('Receivable Bank','BANK','ASSET',10000);
const cash=await account('Receivable Cash','CASH','ASSET',1000);
const cc=await account('Receivable Owner CC','OWNER_CREDIT_CARD','LIABILITY',0,{creditLimit:50000});
const customer=await request('/customers',{method:'POST',body:JSON.stringify({
  customerType:'REGULAR',fullName:'Receivable Customer '+suffix,mobile:'93333'+String(Date.now()).slice(-5),
})},token);

const before=await request('/dashboard/summary',{},token);
const created=await request('/receivables',{method:'POST',body:JSON.stringify({
  customerId:customer.id,amount:1000,sourceAccountId:bank.id,reason:'Test business advance',
  description:'Receivable lifecycle regression',dueAt:new Date(Date.now()+3*86400000).toISOString(),
  referenceNumber:'RCV-'+suffix,
})},token);
assert(created.receivable.status==='PENDING','New receivable not pending');

let detail=await request('/receivables/'+created.receivable.id,{},token);
assert(Number(detail.remainingAmount)===1000&&Number(detail.receivedAmount)===0,'Initial receivable balances wrong');

const afterCreate=await request('/dashboard/summary',{},token);
assert(near(afterCreate.customerReceivable,before.customerReceivable+1000),'Dashboard receivable did not increase');
assert(near(afterCreate.availableFunds,before.availableFunds-1000),'Source account did not reduce available funds');
assert(near(afterCreate.netFinancialPosition,before.netFinancialPosition),'Funding receivable should not change net position');
console.log('✓ funded receivable preserves net position');

const first=await request('/receivables/'+created.receivable.id+'/collections',{method:'POST',body:JSON.stringify({
  amount:400,destinationAccountId:cash.id,referenceNumber:'COL1-'+suffix,notes:'Partial collection',
})},token);
assert(first.receivable.status==='PARTIALLY_RECEIVED','Partial collection status wrong');
assert(Number(first.receivable.remainingAmount)===600,'Partial collection remaining wrong');

const duplicate=await raw('/receivables/'+created.receivable.id+'/collections',{method:'POST',body:JSON.stringify({
  amount:400,destinationAccountId:cash.id,referenceNumber:'COL1-'+suffix,notes:'Partial collection',
})},token);
assert(duplicate.status===409,'Duplicate collection should return 409');

const afterPartial=await request('/dashboard/summary',{},token);
assert(near(afterPartial.customerReceivable,afterCreate.customerReceivable-400),'Partial collection did not reduce receivable');
assert(near(afterPartial.availableFunds,afterCreate.availableFunds+400),'Partial collection did not increase available funds');
assert(near(afterPartial.netFinancialPosition,afterCreate.netFinancialPosition),'Collection should not change net position');
console.log('✓ partial collection + duplicate protection + net position');

const badDestination=await raw('/receivables/'+created.receivable.id+'/collections',{method:'POST',body:JSON.stringify({
  amount:1,destinationAccountId:cc.id,referenceNumber:'BAD-'+suffix,
})},token);
assert(badDestination.status===400,'Owner credit card should be rejected as collection destination');

const second=await request('/receivables/'+created.receivable.id+'/collections',{method:'POST',body:JSON.stringify({
  amount:600,destinationAccountId:bank.id,referenceNumber:'COL2-'+suffix,notes:'Final collection',
})},token);
assert(second.receivable.status==='RECEIVED'&&Number(second.receivable.remainingAmount)===0,'Full collection failed');
console.log('✓ full collection');

await request('/transactions/'+second.transaction.id+'/reverse',{method:'POST',body:JSON.stringify({reason:'Receivable collection reversal test'})},token);
detail=await request('/receivables/'+created.receivable.id,{},token);
assert(detail.status==='PARTIALLY_RECEIVED'&&Number(detail.receivedAmount)===400&&Number(detail.remainingAmount)===600,'Collection reversal did not restore receivable');

await request('/transactions/'+first.transaction.id+'/reverse',{method:'POST',body:JSON.stringify({reason:'First collection reversal test'})},token);
detail=await request('/receivables/'+created.receivable.id,{},token);
assert(detail.status==='PENDING'&&Number(detail.receivedAmount)===0&&Number(detail.remainingAmount)===1000,'Second reversal did not restore original receivable');
console.log('✓ collection reversals restore receivable');

await request('/receivables/'+created.receivable.id+'/cancel',{method:'POST',body:JSON.stringify({reason:'Receivable cancellation regression'})},token);
detail=await request('/receivables/'+created.receivable.id,{},token);
assert(detail.status==='CANCELLED'&&Number(detail.remainingAmount)===0,'Receivable cancellation failed');
const afterCancel=await request('/dashboard/summary',{},token);
assert(near(afterCancel.customerReceivable,before.customerReceivable),'Cancellation did not restore receivable total');
assert(near(afterCancel.availableFunds,before.availableFunds),'Cancellation did not restore funded source account');
assert(near(afterCancel.netFinancialPosition,before.netFinancialPosition),'Cancellation changed net position');
console.log('✓ safe cancellation restores financial position');

const opening=await request('/receivables',{method:'POST',body:JSON.stringify({
  customerId:customer.id,amount:500,reason:'Opening receivable',description:'Legacy amount brought forward',
})},token);
const openingSummary=await request('/dashboard/summary',{},token);
assert(near(openingSummary.customerReceivable,before.customerReceivable+500),'Opening receivable not included');
assert(near(openingSummary.availableFunds,before.availableFunds),'Opening receivable should not alter liquid funds');
assert(near(openingSummary.netFinancialPosition,before.netFinancialPosition+500),'Opening receivable should increase net position');
console.log('✓ opening/legacy receivable uses adjustment without moving cash');

const list=await request('/receivables?page=1&pageSize=10&q='+encodeURIComponent(suffix),{},token);
assert(list.items.some(x=>x.id===opening.receivable.id),'Receivable pagination/search failed');
const report=await request('/reports/receivables',{},token);
assert(report.some(x=>x.id===opening.receivable.id),'Receivables report missing item');
const customerLedger=await request('/reports/customers/'+customer.id,{},token);
assert(customerLedger.receivables.some(x=>x.id===opening.receivable.id),'Customer ledger missing receivable');
const audit=await request('/audit?entityType=CUSTOMER_RECEIVABLE&entityId='+opening.receivable.id,{},token);
assert(audit.some(x=>x.action==='CREATE'),'Receivable create audit missing');

const series=await request('/dashboard/last-10-days?type=CUSTOMER_RECEIVABLE',{},token);
assert(Array.isArray(series)&&series.length===10,'Receivable 10-day series failed');
const trend=await request('/dashboard/position-trend',{},token);
assert(Array.isArray(trend)&&trend.length===10,'Financial-position trend failed');
const last=trend.at(-1);
assert(near(last.netPosition,openingSummary.netFinancialPosition),'Trend closing net position does not match summary');
console.log('✓ reports, customer ledger, audit and dashboard trends');

console.log('RECEIVABLES E2E PASS');
