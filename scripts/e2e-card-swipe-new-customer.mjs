const base='http://127.0.0.1:4002/api';
const email=process.env.OWNER_EMAIL,password=process.env.OWNER_TEMP_PASSWORD;
if(!email||!password)throw new Error('Owner credentials missing');
async function raw(path,options={},token){
  const headers={'content-type':'application/json',...(options.headers||{})};
  if(token)headers.authorization='Bearer '+token;
  const res=await fetch(base+path,{...options,headers});
  const text=await res.text();let body=null;
  try{body=text?JSON.parse(text):null}catch{body=text}
  return {status:res.status,body};
}
async function req(path,options={},token){
  const r=await raw(path,options,token);
  if(r.status<200||r.status>=300)throw new Error(path+' -> '+r.status+' '+JSON.stringify(r.body));
  return r.body;
}
function assert(v,m){if(!v)throw new Error(m)}
function close(a,b,m){if(Math.abs(Number(a)-Number(b))>.01)throw new Error(m+': '+a+' != '+b)}
const login=await req('/auth/login',{method:'POST',body:JSON.stringify({email,password})});
const token=login.accessToken,suffix=Date.now().toString(36);
const provider=await req('/providers',{method:'POST',body:JSON.stringify({name:'Atomic Swipe '+suffix,providerType:'MULTI_SERVICE'})},token);
const gateway=await req('/providers/'+provider.id+'/gateways',{method:'POST',body:JSON.stringify({gatewayName:'Atomic Gateway',defaultChargeType:'PERCENTAGE',defaultChargeRate:2.1})},token);
const terms=await req('/settings/payment-terms',{},token);
const term=terms.find(x=>x.name==='Instant')||terms[0];
const mobile='96666'+String(Date.now()).slice(-5);
const payload={
  newCustomer:{fullName:'Atomic Customer '+suffix,mobile,bankName:'HDFC',lastFourDigits:'6789'},
  swipeAmount:5000,providerId:provider.id,gatewayId:gateway.id,providerChargeRate:2.1,commissionRate:.7,
  paymentTermId:term.id,dueAt:new Date().toISOString(),settledNow:true
};
const swipe=await req('/transactions/card-swipe',{method:'POST',headers:{'idempotency-key':'atomic-new-'+suffix},body:JSON.stringify(payload)},token);
assert(swipe.createdCustomer,'Created customer response missing');
assert(swipe.createdCustomer.customer.mobile===mobile,'Created customer mobile mismatch');
assert(swipe.createdCustomer.card.bankName==='HDFC','Card bank mismatch');
assert(swipe.createdCustomer.card.lastFourDigits==='6789','Card last four mismatch');
assert(swipe.transaction.customerId===swipe.createdCustomer.customer.id,'Swipe customer mismatch');
close(swipe.providerSettlement.expectedAmount,4895,'Provider settlement amount');
close(swipe.payable.originalAmount,4860,'Customer payable amount');
const detail=await req('/customers/'+swipe.createdCustomer.customer.id,{},token);
assert(detail.cards.some(x=>x.lastFourDigits==='6789'&&x.bankName==='HDFC'),'Saved card missing');
assert(detail.transactions.some(x=>x.id===swipe.transaction.id),'Swipe missing from customer history');
console.log('✓ atomic new customer + card + swipe');
const duplicate=await raw('/transactions/card-swipe',{method:'POST',headers:{'idempotency-key':'atomic-dup-'+suffix},body:JSON.stringify({...payload,newCustomer:{...payload.newCustomer,fullName:'Duplicate '+suffix},swipeAmount:1200})},token);
assert(duplicate.status===400,'Duplicate mobile should be rejected');
const invalid=await raw('/transactions/card-swipe',{method:'POST',headers:{'idempotency-key':'atomic-invalid-'+suffix},body:JSON.stringify({...payload,newCustomer:{...payload.newCustomer,mobile:'12345'},swipeAmount:1300})},token);
assert(invalid.status===400,'Invalid Indian mobile should be rejected');
console.log('✓ invalid and duplicate Indian mobiles rejected');
const failMobile='95555'+String(Date.now()).slice(-5);
const failPayload={
  newCustomer:{fullName:'Rollback Customer '+suffix,mobile:failMobile,bankName:'ICICI',lastFourDigits:'4321'},
  swipeAmount:1000,providerId:provider.id,gatewayId:gateway.id,providerChargeRate:2.1,commissionRate:.5,
  paymentTermId:term.id,dueAt:new Date().toISOString(),settledNow:true,
  customerPayments:[{sourceAccountId:'missing-account-'+suffix,amount:974}]
};
const failed=await raw('/transactions/card-swipe',{method:'POST',headers:{'idempotency-key':'atomic-fail-'+suffix},body:JSON.stringify(failPayload)},token);
assert(failed.status>=400,'Expected failed swipe');
const lookup=await req('/customers?q='+encodeURIComponent(failMobile)+'&page=1&pageSize=25',{},token);
assert(!lookup.items.some(x=>x.mobile===failMobile),'Failed swipe left orphan customer');
console.log('✓ failed swipe rolls back new customer/card');
console.log('CARD SWIPE NEW CUSTOMER E2E PASS');
