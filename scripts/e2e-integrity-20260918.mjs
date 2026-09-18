const base='http://127.0.0.1:4002/api';
const email=process.env.OWNER_EMAIL,password=process.env.OWNER_TEMP_PASSWORD;
if(!email||!password)throw new Error('Owner credentials missing');
async function raw(path,options={},token){
 const headers=new Headers(options.headers||{});headers.set('content-type','application/json');
 if(token)headers.set('authorization','Bearer '+token);
 const res=await fetch(base+path,{...options,headers});const text=await res.text();
 let body=null;try{body=text?JSON.parse(text):null;}catch{body=text;}return {status:res.status,body};
}
async function request(path,options={},token){const r=await raw(path,options,token);
 if(r.status<200||r.status>=300)throw new Error((options.method||'GET')+' '+path+' -> '+r.status+' '+JSON.stringify(r.body));return r.body;}
function assert(v,m){if(!v)throw new Error(m);} function close(a,b,m){if(Math.abs(Number(a)-Number(b))>0.01)throw new Error(m+': expected '+b+', got '+a);}
function key(x){return 'integrity-'+x+'-'+Date.now()+'-'+Math.random().toString(36).slice(2);}
const login=await request('/auth/login',{method:'POST',body:JSON.stringify({email,password})});const token=login.accessToken;
const suffix=Date.now().toString(36);
async function account(name,type,opening,extra={}){return request('/accounts',{method:'POST',body:JSON.stringify({
 accountName:name+' '+suffix,accountType:type,accountNature:'ASSET',usageType:'MIXED',openingBalance:opening,...extra})},token);}
const provider=await request('/providers',{method:'POST',body:JSON.stringify({name:'Integrity Provider '+suffix,providerType:'MULTI_SERVICE'})},token);
const gateway=await request('/providers/'+provider.id+'/gateways',{method:'POST',body:JSON.stringify({gatewayName:'Integrity Gateway',defaultChargeType:'PERCENTAGE',defaultChargeRate:1})},token);
const provider2=await request('/providers',{method:'POST',body:JSON.stringify({name:'Integrity Provider 2 '+suffix,providerType:'MULTI_SERVICE'})},token);
const cash=await account('Integrity Cash','CASH',5000);
const bank=await account('Integrity Bank','BANK',1000);
const zeroBank=await account('Integrity Zero Bank','BANK',0);
const wallet=await account('Integrity Wallet','PROVIDER_WALLET',0,{providerId:provider.id});
const wrongWallet=await account('Integrity Wrong Wallet','PROVIDER_WALLET',0,{providerId:provider2.id});
const customer=await request('/customers',{method:'POST',body:JSON.stringify({customerType:'REGULAR',fullName:'Integrity Customer '+suffix,mobile:'9333300001'})},token);
let bad=await raw('/transactions/micro-atm',{method:'POST',headers:{'idempotency-key':key('wrong-wallet')},body:JSON.stringify({
 customerId:customer.id,cardLastFour:'1111',withdrawalAmount:100,providerId:provider.id,gatewayId:gateway.id,
 providerCommissionRate:1,cashAccountId:cash.id,settlementAccountId:wrongWallet.id})},token);
assert(bad.status===400,'Micro ATM must reject another provider wallet');
bad=await raw('/transactions/micro-atm',{method:'POST',headers:{'idempotency-key':key('no-cash')},body:JSON.stringify({
 customerId:customer.id,cardLastFour:'2222',withdrawalAmount:999999,providerId:provider.id,gatewayId:gateway.id,
 providerCommissionRate:1,cashAccountId:cash.id,settlementAccountId:wallet.id})},token);
assert(bad.status===400,'Micro ATM must reject insufficient cash');
const micro=await request('/transactions/micro-atm',{method:'POST',headers:{'idempotency-key':key('micro')},body:JSON.stringify({
 customerId:customer.id,cardLastFour:'4242',customerBankName:'Test Bank',withdrawalAmount:1000,providerId:provider.id,gatewayId:gateway.id,
 providerCommissionRate:1,cashAccountId:cash.id,settlementAccountId:wallet.id,providerReference:'MICRO-'+suffix})},token);
close(micro.providerSettlement.expectedAmount,1010,'Micro ATM settlement');
let accounts=await request('/dashboard/accounts',{},token);
close(accounts.find(x=>x.id===cash.id).currentBalance,4000,'Micro ATM cash out');
close(accounts.find(x=>x.id===wallet.id).currentBalance,0,'Wallet not credited before settlement');
let summary=await request('/dashboard/summary',{},token);
close(summary.pendingProviderSettlements,1010,'Micro ATM provider clearing');
const detail=await request('/transactions/'+micro.transaction.id,{},token);
assert(detail.microAtm&&detail.microAtm.cardLastFour==='4242','Micro ATM detail missing');
close(detail.microAtm.providerCommissionAmount,10,'Micro ATM provider commission');
await request('/provider-settlements/'+micro.providerSettlement.id+'/receipts',{method:'POST',headers:{'idempotency-key':key('micro-part1')},body:JSON.stringify({
 amount:400,destinationAccountId:bank.id,referenceNumber:'MICRO-BANK-'+suffix})},token);
await request('/provider-settlements/'+micro.providerSettlement.id+'/receipts',{method:'POST',headers:{'idempotency-key':key('micro-part2')},body:JSON.stringify({
 amount:610,destinationAccountId:wallet.id,referenceNumber:'MICRO-WALLET-'+suffix})},token);
summary=await request('/dashboard/summary',{},token);close(summary.pendingProviderSettlements,0,'Micro ATM clearing after settlement');
console.log('✓ Micro ATM accounting, balance guard, wallet ownership and split provider receipts');
const historical=await request('/transactions/micro-atm',{method:'POST',headers:{'idempotency-key':key('historical')},body:JSON.stringify({
 customerId:customer.id,cardLastFour:'5656',withdrawalAmount:500,providerId:provider.id,gatewayId:gateway.id,
 providerCommissionRate:2,cashAccountId:cash.id,settlementAccountId:wallet.id})},token);
const receivedAt=new Date(Date.now()-2*86400000);
const histReceipt=await request('/provider-settlements/'+historical.providerSettlement.id+'/receipts',{method:'POST',headers:{'idempotency-key':key('hist-receipt')},body:JSON.stringify({
 amount:510,destinationAccountId:wallet.id,receivedAt:receivedAt.toISOString(),referenceNumber:'HIST-'+suffix})},token);
assert(Math.abs(new Date(histReceipt.transaction.transactionAt)-receivedAt)<1000,'Historical receipt transactionAt mismatch');
const series=await request('/dashboard/last-10-days?type=TOTAL',{},token);
const local=new Date(receivedAt.getTime()+330*60*1000);
const day=[local.getUTCFullYear(),String(local.getUTCMonth()+1).padStart(2,'0'),String(local.getUTCDate()).padStart(2,'0')].join('-');
const historicalRow=series.find(x=>x.date===day);
assert(historicalRow&&Number(historicalRow.moneyIn)>=510,'Historical provider receipt missing from posting-date series');
console.log('✓ provider receipt receivedAt controls historical transaction and ledger reporting');
const guarded=await request('/transactions/micro-atm',{method:'POST',headers:{'idempotency-key':key('guarded')},body:JSON.stringify({
 customerId:customer.id,cardLastFour:'7878',withdrawalAmount:100,providerId:provider.id,gatewayId:gateway.id,
 providerCommissionRate:1,cashAccountId:cash.id,settlementAccountId:zeroBank.id})},token);
const guardedReceipt=await request('/provider-settlements/'+guarded.providerSettlement.id+'/receipts',{method:'POST',headers:{'idempotency-key':key('guarded-receipt')},body:JSON.stringify({
 amount:101,destinationAccountId:zeroBank.id,referenceNumber:'GUARD-'+suffix})},token);
const moved=await request('/transactions/internal-transfer',{method:'POST',headers:{'idempotency-key':key('move-out')},body:JSON.stringify({
 sourceAccountId:zeroBank.id,destinationAccountId:bank.id,transferAmount:101,chargeAmount:0})},token);
