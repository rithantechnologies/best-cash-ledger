const base='http://127.0.0.1:4002/api';
const email=process.env.OWNER_EMAIL,password=process.env.OWNER_TEMP_PASSWORD;
if(!email||!password)throw new Error('Owner credentials missing');

async function raw(path,options={},token){
  const headers={'content-type':'application/json',...(options.headers||{})};
  if(token)headers.authorization='Bearer '+token;
  const res=await fetch(base+path,{...options,headers});
  const text=await res.text();let body=null;
  try{body=text?JSON.parse(text):null;}catch{body=text;}
  return {status:res.status,body};
}
async function req(path,options={},token){
  const r=await raw(path,options,token);
  if(r.status<200||r.status>=300)throw new Error(path+' -> '+r.status+' '+JSON.stringify(r.body));
  return r.body;
}
function close(a,b,m){if(Math.abs(Number(a)-Number(b))>0.01)throw new Error(m+': '+a+' != '+b);}
function assert(v,m){if(!v)throw new Error(m);}
const login=await req('/auth/login',{method:'POST',body:JSON.stringify({email,password})});
const token=login.accessToken,suffix=Date.now().toString(36);
const provider=await req('/providers',{method:'POST',body:JSON.stringify({name:'Recon Provider '+suffix,providerType:'MULTI_SERVICE'})},token);
const gateway=await req('/providers/'+provider.id+'/gateways',{method:'POST',body:JSON.stringify({gatewayName:'Recon Gateway',defaultChargeType:'PERCENTAGE',defaultChargeRate:2.1})},token);
const bank=await req('/accounts',{method:'POST',body:JSON.stringify({accountName:'Recon Bank '+suffix,accountType:'BANK',accountNature:'ASSET',usageType:'BUSINESS',openingBalance:5000})},token);
const zero=await req('/accounts',{method:'POST',body:JSON.stringify({accountName:'Recon Zero '+suffix,accountType:'BANK',accountNature:'ASSET',usageType:'BUSINESS',openingBalance:0})},token);
const customer=await req('/customers',{method:'POST',body:JSON.stringify({customerType:'REGULAR',fullName:'Recon Customer '+suffix,mobile:'9777700001'})},token);
const card=await req('/customers/'+customer.id+'/cards',{method:'POST',body:JSON.stringify({bankName:'Card',cardType:'CREDIT',lastFourDigits:'4545'})},token);
const terms=await req('/settings/payment-terms',{},token);
const term=terms.find(x=>x.name==='Instant')||terms[0];
let accounts=await req('/dashboard/accounts',{},token);
const wallet=accounts.find(x=>x.accountType==='PROVIDER_WALLET'&&x.providerId===provider.id);
assert(wallet,'Built-in provider wallet missing');
const swipe=await req('/transactions/card-swipe',{method:'POST',headers:{'idempotency-key':'recon-'+suffix},body:JSON.stringify({
  customerId:customer.id,customerCardId:card.id,swipeAmount:5000,
  providerId:provider.id,gatewayId:gateway.id,providerChargeRate:2.1,commissionRate:1,
  paymentTermId:term.id,dueAt:new Date().toISOString(),settledNow:true,
  customerPayments:[
    {sourceAccountId:wallet.id,amount:3000},
    {sourceAccountId:bank.id,amount:1845}
  ]
})},token);
close(swipe.payable.originalAmount,4845,'Customer payable');
close(swipe.payable.paidAmount,4845,'Customer paid');
close(swipe.payable.remainingAmount,0,'Customer remaining');
assert(swipe.payable.status==='PAID','Payable should be PAID');
assert(swipe.payoutTransactions.length===2,'Expected two payout transactions');
const settlement=await req('/provider-settlements/'+swipe.providerSettlement.id,{},token);
close(settlement.expectedAmount,4895,'Provider wallet credit');
assert(settlement.status==='SETTLED','Provider settlement should be settled');
accounts=await req('/dashboard/accounts',{},token);
close(accounts.find(x=>x.id===wallet.id).currentBalance,1895,'Wallet after credit and customer payout');
close(accounts.find(x=>x.id===bank.id).currentBalance,3155,'Bank after customer payout');
const summary=await req('/dashboard/summary',{},token);
close(summary.customerPayable,0,'Open customer payable');
close(summary.pendingProviderSettlements,0,'Pending provider settlement');
close(summary.operatingPosition,5050,'Operating position equals opening funds plus commission');
const detail=await req('/transactions/'+swipe.transaction.id,{},token);
close(detail.charges.find(x=>x.chargeType==='PROVIDER').amount,105,'Provider fee record');
close(detail.commissions.find(x=>x.commissionType==='CARD_SWIPE').amount,50,'Commission record');
console.log('✓ swipe formula and multi-source customer reconciliation');
const beforeFail=await req('/dashboard/accounts',{},token);
const walletBefore=beforeFail.find(x=>x.id===wallet.id).currentBalance;
const bankBefore=beforeFail.find(x=>x.id===bank.id).currentBalance;
const bad=await raw('/transactions/card-swipe',{method:'POST',headers:{'idempotency-key':'recon-fail-'+suffix},body:JSON.stringify({
  customerId:customer.id,customerCardId:card.id,swipeAmount:1000,
  providerId:provider.id,gatewayId:gateway.id,providerChargeRate:2,commissionRate:3,
  paymentTermId:term.id,dueAt:new Date().toISOString(),settledNow:true,
  customerPayments:[
    {sourceAccountId:bank.id,amount:900},
    {sourceAccountId:zero.id,amount:50}
  ]
})},token);
assert(bad.status===400,'Insufficient payout leg should reject whole swipe');
const afterFail=await req('/dashboard/accounts',{},token);
close(afterFail.find(x=>x.id===wallet.id).currentBalance,walletBefore,'Failed swipe must not credit wallet');
close(afterFail.find(x=>x.id===bank.id).currentBalance,bankBefore,'Failed swipe must not debit bank');
const afterSummary=await req('/dashboard/summary',{},token);
close(afterSummary.customerPayable,0,'Failed swipe must not create payable');
close(afterSummary.pendingProviderSettlements,0,'Failed swipe must not create provider clearing');
console.log('✓ reconciliation failure is atomic');
console.log('CARD SWIPE RECONCILIATION E2E PASS');
