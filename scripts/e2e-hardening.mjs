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
function close(a,b,m){if(Math.abs(Number(a)-Number(b))>0.01)throw new Error(m+': expected '+b+', got '+a);}
function key(label){return 'hardening-'+label+'-'+Date.now()+'-'+Math.random().toString(36).slice(2);}

const health=await request('/health');
assert(health.database==='connected','DB-aware health did not report connected');
console.log('✓ database-aware health');

const login=await request('/auth/login',{method:'POST',body:JSON.stringify({email,password})});
const token=login.accessToken;assert(token,'Owner login token missing');
console.log('✓ owner login');

const suffix=Date.now().toString(36);
async function account(name,type,nature,opening,extra={}){
  return request('/accounts',{method:'POST',body:JSON.stringify({
    accountName:name+' '+suffix,accountType:type,accountNature:nature,usageType:'MIXED',openingBalance:opening,...extra,
  })},token);
}
const provider=await request('/providers',{method:'POST',body:JSON.stringify({name:'Hardening Provider '+suffix,providerType:'MULTI_SERVICE'})},token);
const gateway=await request('/providers/'+provider.id+'/gateways',{method:'POST',body:JSON.stringify({gatewayName:'Hardening Gateway',defaultChargeType:'PERCENTAGE',defaultChargeRate:2})},token);
const provider2=await request('/providers',{method:'POST',body:JSON.stringify({name:'Hardening Provider 2 '+suffix,providerType:'MULTI_SERVICE'})},token);
const gateway2=await request('/providers/'+provider2.id+'/gateways',{method:'POST',body:JSON.stringify({gatewayName:'Hardening Gateway 2',defaultChargeType:'PERCENTAGE',defaultChargeRate:2})},token);

const cash=await account('Hardening Cash','CASH','ASSET',10000);
const bank=await account('Hardening Bank','BANK','ASSET',10000);
const wallet=await account('Hardening Wallet','PROVIDER_WALLET','ASSET',0,{providerId:provider.id});
const cardLiability=await account('Hardening Owner CC','OWNER_CREDIT_CARD','LIABILITY',0,{creditLimit:5000});
const zeroBank=await account('Hardening Zero Bank','BANK','ASSET',0);
console.log('✓ financial accounts and providers');

const customer=await request('/customers',{method:'POST',body:JSON.stringify({customerType:'REGULAR',fullName:'Hardening Customer '+suffix,mobile:'9555500001'})},token);
const card=await request('/customers/'+customer.id+'/cards',{method:'POST',body:JSON.stringify({bankName:'Hardening Card Bank',cardType:'CREDIT',lastFourDigits:'4242'})},token);
const other=await request('/customers',{method:'POST',body:JSON.stringify({customerType:'REGULAR',fullName:'Other Customer '+suffix,mobile:'9555500002'})},token);
const otherCard=await request('/customers/'+other.id+'/cards',{method:'POST',body:JSON.stringify({bankName:'Other Bank',cardType:'CREDIT',lastFourDigits:'8989'})},token);
const terms=await request('/settings/payment-terms',{},token);
const term=terms.find(x=>x.name==='7 Days')||terms[0];
const categories=await request('/settings/expense-categories',{},token);
const businessCategory=categories.find(x=>x.expenseUsage!=='PERSONAL');

let invalid=await raw('/transactions/card-swipe',{method:'POST',headers:{'idempotency-key':key('wrong-card')},body:JSON.stringify({
 customerId:customer.id,customerCardId:otherCard.id,swipeAmount:1000,providerId:provider.id,gatewayId:gateway.id,providerChargeRate:2,commissionRate:3,paymentTermId:term.id,dueAt:new Date(Date.now()+86400000).toISOString(),settlementAccountId:wallet.id
})},token);
assert(invalid.status===400,'Cross-customer card should be rejected');

invalid=await raw('/transactions/card-swipe',{method:'POST',headers:{'idempotency-key':key('wrong-gateway')},body:JSON.stringify({
 customerId:customer.id,customerCardId:card.id,swipeAmount:1000,providerId:provider.id,gatewayId:gateway2.id,providerChargeRate:2,commissionRate:3,paymentTermId:term.id,dueAt:new Date(Date.now()+86400000).toISOString(),settlementAccountId:wallet.id
})},token);
assert(invalid.status===400,'Gateway from another provider should be rejected');

console.log('✓ customer/card/provider/gateway relationship validation');

const swipe=await request('/transactions/card-swipe',{method:'POST',headers:{'idempotency-key':key('swipe')},body:JSON.stringify({
 customerId:customer.id,customerCardId:card.id,swipeAmount:1000,providerId:provider.id,gatewayId:gateway.id,providerChargeRate:2,commissionRate:3,paymentTermId:term.id,dueAt:new Date(Date.now()+7*86400000).toISOString(),settlementAccountId:cash.id,settlementDueAt:new Date(Date.now()+86400000).toISOString(),referenceNumber:'HARD-SWIPE-'+suffix
})},token);
assert(swipe.providerSettlement.destinationAccountId===wallet.id,'Card swipe must force the provider built-in wallet');
close(swipe.payable.originalAmount,970,'Card customer payable formula');
close(swipe.providerSettlement.expectedAmount,980,'Provider settlement amount');
let accounts=await request('/dashboard/accounts',{},token);
close(accounts.find(x=>x.id===wallet.id).currentBalance,0,'Wallet must not be credited before settlement');
let summary=await request('/dashboard/summary',{},token);
close(summary.pendingProviderSettlements,980,'Provider clearing pending');
close(summary.operatingPosition,20010,'Operating position after card swipe');
console.log('✓ card swipe uses conservative provider clearing and correct margin');

let settlement=await request('/provider-settlements/'+swipe.providerSettlement.id+'/receipts',{method:'POST',headers:{'idempotency-key':key('settle1')},body:JSON.stringify({amount:400,destinationAccountId:wallet.id,referenceNumber:'SETTLE-1-'+suffix})},token);
close(settlement.settlement.remainingAmount,580,'Partial settlement remaining');
accounts=await request('/dashboard/accounts',{},token);
close(accounts.find(x=>x.id===wallet.id).currentBalance,400,'Wallet after partial settlement');
summary=await request('/dashboard/summary',{},token);
close(summary.pendingProviderSettlements,580,'Clearing after partial settlement');
close(summary.operatingPosition,20010,'Operating position unchanged by clearing movement');

await request('/provider-settlements/'+swipe.providerSettlement.id+'/receipts',{method:'POST',headers:{'idempotency-key':key('settle2')},body:JSON.stringify({amount:580,destinationAccountId:wallet.id,referenceNumber:'SETTLE-2-'+suffix})},token);
const settledDetail=await request('/provider-settlements/'+swipe.providerSettlement.id,{},token);
assert(settledDetail.status==='SETTLED','Provider settlement should be settled');
summary=await request('/dashboard/summary',{},token);
close(summary.pendingProviderSettlements,0,'Clearing after full settlement');
console.log('✓ partial and full provider settlement lifecycle');

const aeps=await request('/transactions/aeps',{method:'POST',headers:{'idempotency-key':key('aeps')},body:JSON.stringify({
 customerId:customer.id,aadhaarLastFour:'1234',customerBankName:'Hardening Bank',withdrawalAmount:1000,providerId:provider.id,gatewayId:gateway.id,platformChargeRate:0.5,commissionRate:1,cashAccountId:cash.id,settlementAccountId:wallet.id,providerReference:'HARD-AEPS-'+suffix
})},token);
close(aeps.providerSettlement.expectedAmount,995,'AePS provider settlement');
const aepsReceipt=await request('/provider-settlements/'+aeps.providerSettlement.id+'/receipts',{method:'POST',headers:{'idempotency-key':key('aeps-settle')},body:JSON.stringify({amount:500,destinationAccountId:wallet.id,referenceNumber:'AEPS-SETTLE-'+suffix})},token);

invalid=await raw('/transactions/'+aeps.transaction.id+'/reverse',{method:'POST',body:JSON.stringify({reason:'Should block while settlement receipt exists'})},token);
assert(invalid.status===400,'Source reversal must be blocked while provider receipts exist');
await request('/transactions/'+aepsReceipt.transaction.id+'/reverse',{method:'POST',body:JSON.stringify({reason:'Reverse provider receipt before source'})},token);
await request('/transactions/'+aeps.transaction.id+'/reverse',{method:'POST',body:JSON.stringify({reason:'Reverse AePS after settlement receipt reversal'})},token);
const aepsSettlementAfter=await request('/provider-settlements/'+aeps.providerSettlement.id,{},token);
assert(aepsSettlementAfter.status==='REVERSED','AePS settlement should reverse with source');
console.log('✓ provider settlement/source reversal ordering');

const payRace=await Promise.all([
 raw('/payables/'+swipe.payable.id+'/payments',{method:'POST',headers:{'idempotency-key':key('payrace1')},body:JSON.stringify({amount:700,sourceAccountId:bank.id,referenceNumber:'RACE-P1'})},token),
 raw('/payables/'+swipe.payable.id+'/payments',{method:'POST',headers:{'idempotency-key':key('payrace2')},body:JSON.stringify({amount:700,sourceAccountId:bank.id,referenceNumber:'RACE-P2'})},token),
]);
assert(payRace.filter(x=>x.status>=200&&x.status<300).length===1,'Exactly one concurrent payable payment should succeed');
assert(payRace.filter(x=>x.status===400).length===1,'One concurrent payable payment should be rejected');
const payAfter=await request('/payables/'+swipe.payable.id,{},token);
close(payAfter.remainingAmount,270,'Payable remaining after concurrent race');
console.log('✓ concurrent payable payout protection');

const receivable=await request('/receivables',{method:'POST',headers:{'idempotency-key':key('recv')},body:JSON.stringify({
 customerId:customer.id,amount:500,reason:'Hardening receivable',reasonCategory:'ADJUSTMENT',dueAt:new Date(Date.now()+86400000).toISOString()
})},token);
const recvRace=await Promise.all([
 raw('/receivables/'+receivable.receivable.id+'/collections',{method:'POST',headers:{'idempotency-key':key('recrace1')},body:JSON.stringify({amount:400,destinationAccountId:bank.id})},token),
 raw('/receivables/'+receivable.receivable.id+'/collections',{method:'POST',headers:{'idempotency-key':key('recrace2')},body:JSON.stringify({amount:400,destinationAccountId:bank.id})},token),
]);
assert(recvRace.filter(x=>x.status>=200&&x.status<300).length===1,'Exactly one concurrent receivable collection should succeed');
assert(recvRace.filter(x=>x.status===400).length===1,'One concurrent receivable collection should be rejected');
const recvAfter=await request('/receivables/'+receivable.receivable.id,{},token);
close(recvAfter.remainingAmount,100,'Receivable remaining after concurrent race');
assert(recvAfter.reasonCategory==='ADJUSTMENT','Structured receivable reason missing');
console.log('✓ concurrent receivable collection protection and reason category');

invalid=await raw('/transactions/internal-transfer',{method:'POST',headers:{'idempotency-key':key('insufficient')},body:JSON.stringify({sourceAccountId:zeroBank.id,destinationAccountId:bank.id,transferAmount:1,chargeAmount:0})},token);
assert(invalid.status===400,'Insufficient-funds transfer should fail');
invalid=await raw('/transactions/atm-withdrawal',{method:'POST',headers:{'idempotency-key':key('wrong-atm')},body:JSON.stringify({bankAccountId:cash.id,cashAccountId:cash.id,cashReceived:1,atmCharge:0})},token);
assert(invalid.status===400,'ATM bank account must be BANK');
invalid=await raw('/transactions/expense',{method:'POST',headers:{'idempotency-key':key('limit')},body:JSON.stringify({expenseType:'BUSINESS',expenseCategoryId:businessCategory.id,amount:6000,paymentAccountId:cardLiability.id,description:'Over limit'})},token);
assert(invalid.status===400,'Credit limit overrun should fail');
console.log('✓ insufficient funds, account-type and credit-limit controls');

const explicitKey=key('explicit-dedupe');
await request('/transactions/internal-transfer',{method:'POST',headers:{'idempotency-key':explicitKey},body:JSON.stringify({sourceAccountId:bank.id,destinationAccountId:wallet.id,transferAmount:10,chargeAmount:0,referenceNumber:'DEDUPE-'+suffix})},token);
invalid=await raw('/transactions/internal-transfer',{method:'POST',headers:{'idempotency-key':explicitKey},body:JSON.stringify({sourceAccountId:bank.id,destinationAccountId:wallet.id,transferAmount:10,chargeAmount:0,referenceNumber:'DEDUPE-'+suffix})},token);
assert(invalid.status===409,'Explicit duplicate idempotency key should return 409');
console.log('✓ explicit idempotency keys');

invalid=await raw('/accounts/'+bank.id+'/active',{method:'PATCH',body:JSON.stringify({isActive:false})},token);
assert(invalid.status===400,'Non-zero bank must not deactivate');
const disabled=await request('/accounts/'+zeroBank.id+'/active',{method:'PATCH',body:JSON.stringify({isActive:false})},token);
assert(disabled.isActive===false,'Zero account should deactivate');
console.log('✓ account deactivation safeguards');

const cashOpen=await request('/cash-counter/open',{method:'POST',body:JSON.stringify({cashAccountId:cash.id,denominations:[{denomination:500,quantity:20}]})},token);
const cashBefore=Number((await request('/dashboard/accounts',{},token)).find(x=>x.id===cash.id).currentBalance);
const actual=cashBefore-100;
const q500=Math.floor(actual/500);
const remainder=actual-q500*500;
const closeDenoms=[{denomination:500,quantity:q500}];
if(remainder>0)closeDenoms.push({denomination:1,quantity:remainder});
const cashClosed=await request('/cash-counter/'+cashOpen.id+'/close',{method:'POST',body:JSON.stringify({denominations:closeDenoms,notes:'Hardening intentional shortage'})},token);
close(cashClosed.differenceAmount,-100,'Cash physical shortage');
assert(cashClosed.adjustmentTransactionId,'Cash adjustment transaction missing');
const cashAfter=Number((await request('/dashboard/accounts',{},token)).find(x=>x.id===cash.id).currentBalance);
close(cashAfter,actual,'Cash ledger adjusted to physical count');
const adjustmentReport=await request('/reports/transactions?type=CASH_ADJUSTMENT',{},token);
assert(adjustmentReport.some(x=>x.id===cashClosed.adjustmentTransactionId),'Cash adjustment missing from report');
console.log('✓ cash over/short posts balanced cash adjustment');

const preEod=await request('/end-of-day/status',{},token);
assert(preEod.openCashSessions===0,'Cash sessions should be closed before EOD');
const eod=await request('/end-of-day/snapshot',{method:'POST'},token);
assert(eod.position.id,'EOD snapshot missing');
close(eod.position.cashVariance,-100,'EOD cash variance');
invalid=await raw('/end-of-day/snapshot',{method:'POST'},token);
assert(invalid.status===409,'Second EOD snapshot should be rejected');
const eodReport=await request('/reports/end-of-day',{},token);
assert(eodReport.some(x=>x.id===eod.position.id),'EOD report missing saved position');
console.log('✓ end-of-day snapshot lock and report visibility');

const settlementReport=await request('/reports/provider-settlements',{},token);
assert(settlementReport.some(x=>x.id===swipe.providerSettlement.id),'Provider settlement report missing');
const trend=await request('/dashboard/position-trend',{},token);
assert(Array.isArray(trend)&&trend.length===10&&typeof trend.at(-1).operatingPosition==='number','Position trend missing operating position');
const series=await request('/dashboard/last-10-days?type=TOTAL',{},token);
assert(Array.isArray(series)&&series.length===10,'10-day total series invalid');
assert(Number(series[0].closing)===0,'Accounts created today must not rewrite prior 10-day history');
console.log('✓ settlement/EOD reporting and date-aware history');

for(let i=0;i<6;i++){
  const bad=await raw('/auth/login',{method:'POST',body:JSON.stringify({email:'rate-limit-'+suffix+'@invalid.local',password:'wrong-password'})});
  if(i<5)assert(bad.status===401,'Bad login should be 401 before threshold');
  else assert(bad.status===429,'Sixth bad login should be rate limited');
}
console.log('✓ login throttling');

console.log('HARDENING E2E PASS');
