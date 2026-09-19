const base='http://127.0.0.1:4002/api';
const email=process.env.OWNER_EMAIL,password=process.env.OWNER_TEMP_PASSWORD;
if(!email||!password)throw new Error('Owner credentials missing');
async function req(path,options={},token){
 const headers={'content-type':'application/json',...(options.headers||{})};
 if(token)headers.authorization='Bearer '+token;
 const res=await fetch(base+path,{...options,headers});
 const text=await res.text();let body=null;
 try{body=text?JSON.parse(text):null;}catch{body=text;}
 if(!res.ok)throw new Error(path+' -> '+res.status+' '+JSON.stringify(body));
 return body;
}
function assert(v,m){if(!v)throw new Error(m);}
const login=await req('/auth/login',{method:'POST',body:JSON.stringify({email,password})});
const token=login.accessToken,suffix=Date.now().toString(36);
const provider=await req('/providers',{method:'POST',body:JSON.stringify({name:'Search Provider '+suffix,providerType:'MULTI_SERVICE'})},token);
const gateway=await req('/providers/'+provider.id+'/gateways',{method:'POST',body:JSON.stringify({gatewayName:'Search Gateway',defaultChargeType:'PERCENTAGE',defaultChargeRate:2})},token);
const customer=await req('/customers',{method:'POST',body:JSON.stringify({customerType:'REGULAR',fullName:'Arun Search '+suffix,mobile:'9876543210'})},token);
const card=await req('/customers/'+customer.id+'/cards',{method:'POST',body:JSON.stringify({bankName:'Search Bank',cardType:'CREDIT',lastFourDigits:'7319'})},token);
const terms=await req('/settings/payment-terms',{},token);
const term=terms.find(x=>x.name==='Instant')||terms[0];
const swipePayload={customerId:customer.id,customerCardId:card.id,swipeAmount:1000,providerId:provider.id,gatewayId:gateway.id,providerChargeRate:2,commissionRate:1,paymentTermId:term.id,dueAt:new Date().toISOString(),settledNow:false};
const swipe=await req('/transactions/card-swipe',{method:'POST',body:JSON.stringify(swipePayload)},token);
const byName=await req('/search?q='+encodeURIComponent('Arun Search'),{},token);
assert(byName.customers.some(x=>x.id===customer.id),'Name search did not find customer');
assert(byName.transactions.some(x=>x.id===swipe.transaction.id),'Name search did not return customer transaction');
const byMobile=await req('/search?q=9876543210',{},token);
assert(byMobile.customers.some(x=>x.id===customer.id),'Mobile search did not find customer');
const byCard=await req('/search?q=7319',{},token);
const matched=byCard.customers.find(x=>x.id===customer.id);
assert(matched,'Last-four search did not find customer');
assert(matched.cards.some(x=>x.lastFourDigits==='7319'),'Last-four card hint missing');
assert(byCard.transactions.some(x=>x.id===swipe.transaction.id),'Last-four search did not return customer transaction');
const directory=await req('/customers?q=7319&page=1&pageSize=25',{},token);
assert(directory.items.some(x=>x.id===customer.id),'Customer directory last-four search failed');
const detail=await req('/customers/'+customer.id,{},token);
assert(detail.transactions.some(x=>x.id===swipe.transaction.id),'Customer profile transaction history missing');
console.log('CUSTOMER SEARCH E2E PASS');
