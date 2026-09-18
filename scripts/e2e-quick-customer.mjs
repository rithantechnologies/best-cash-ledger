const base='http://127.0.0.1:4002/api';
const email=process.env.OWNER_EMAIL,password=process.env.OWNER_TEMP_PASSWORD;
if(!email||!password)throw new Error('Owner credentials missing');

async function req(path,options={},token){
  const headers={'content-type':'application/json',...(options.headers||{})};
  if(token)headers.authorization='Bearer '+token;
  const res=await fetch(base+path,{...options,headers});
  const body=await res.json().catch(()=>null);
  if(!res.ok)throw new Error((options.method||'GET')+' '+path+' -> '+res.status+' '+JSON.stringify(body));
  return body;
}

const login=await req('/auth/login',{method:'POST',body:JSON.stringify({email,password})});
const token=login.accessToken;
const suffix=Date.now().toString().slice(-7);
const created=await req('/customers/quick-card',{method:'POST',body:JSON.stringify({
  fullName:'Quick Customer '+suffix,
  mobile:'9'+suffix.padStart(9,'0').slice(0,9),
  lastFourDigits:'4321'
})},token);

if(!created.customer?.id)throw new Error('Customer id missing');
if(!created.card?.id)throw new Error('Card id missing');
if(created.card.lastFourDigits!=='4321')throw new Error('Last four mismatch');

const detail=await req('/customers/'+created.customer.id,{},token);
if(!detail.cards.some(card=>card.id===created.card.id&&card.lastFourDigits==='4321'))throw new Error('Saved card not linked to customer');
console.log('QUICK CUSTOMER E2E PASS');
