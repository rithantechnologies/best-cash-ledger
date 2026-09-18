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

const login=await request('/auth/login',{method:'POST',body:JSON.stringify({email,password})});
const token=login.accessToken;
const suffix=Date.now().toString(36);

async function account(name,type,opening){
  return request('/accounts',{method:'POST',body:JSON.stringify({accountName:name+' '+suffix,accountType:type,accountNature:'ASSET',usageType:'MIXED',openingBalance:opening})},token);
}
const cash=await account('Transfer Cash','CASH',10000);
const bank=await account('Transfer Bank','BANK',10000);

const customer=await request('/customers',{method:'POST',body:JSON.stringify({customerType:'REGULAR',fullName:'Transfer Customer '+suffix,mobile:'9333333333'})},token);
const customerBank=await request('/customers/'+customer.id+'/banks',{method:'POST',body:JSON.stringify({accountHolderName:customer.fullName,bankName:'Saved Bank',accountReference:'XXXX3333',ifsc:'TEST0003333'})},token);
const customerUpi=await request('/customers/'+customer.id+'/upi',{method:'POST',body:JSON.stringify({accountName:customer.fullName,upiId:'transfer'+suffix+'@upi',providerName:'GPay'})},token);

const transfer=await request('/transactions/cash-transfer',{method:'POST',body:JSON.stringify({
  customerId:customer.id,
  customerBankAccountId:customerBank.id,
  requestedAmount:3000,
  commissionMethod:'ADD_ON',
  commissionRate:2,
  transferChargeAmount:10,
  transferChargeType:'BANK',
  cashAccountId:cash.id,
  sourceAccountId:bank.id,
  referenceNumber:'BANKDEST-'+suffix,
  notes:'Saved customer bank with transfer fee',
})},token);

const detail=await request('/transactions/'+transfer.id,{},token);
assert(detail.cashTransfer.customerBankAccountId===customerBank.id,'Saved customer bank destination not stored');
close(detail.cashTransfer.transferChargeAmount,10,'Transfer charge detail');
assert(detail.charges.some(x=>Number(x.amount)===10&&x.chargeType==='BANK'),'Separate transfer charge record missing');
assert(detail.notes==='Saved customer bank with transfer fee','Transfer notes missing');

let accounts=await request('/dashboard/accounts',{},token);
close(accounts.find(x=>x.id===cash.id).currentBalance,13060,'Cash balance');
close(accounts.find(x=>x.id===bank.id).currentBalance,6990,'Bank balance');

const upiTransfer=await request('/transactions/cash-transfer',{method:'POST',body:JSON.stringify({
  customerId:customer.id,
  customerUpiAccountId:customerUpi.id,
  requestedAmount:1000,
  commissionMethod:'DEDUCT',
  commissionRate:2,
  transferChargeAmount:0,
  cashAccountId:cash.id,
  sourceAccountId:bank.id,
  referenceNumber:'UPIDEST-'+suffix,
})},token);
const upiDetail=await request('/transactions/'+upiTransfer.id,{},token);
assert(upiDetail.cashTransfer.customerUpiAccountId===customerUpi.id,'Saved UPI destination not stored');

const invalid=await raw('/transactions/cash-transfer',{method:'POST',body:JSON.stringify({
  customerId:customer.id,
  customerBankAccountId:customerBank.id,
  customerUpiAccountId:customerUpi.id,
  requestedAmount:500,
  commissionMethod:'ADD_ON',
  commissionRate:1,
  cashAccountId:cash.id,
  sourceAccountId:bank.id,
})},token);
assert(invalid.status===400,'Multiple destinations should be rejected');

const report=await request('/reports/transactions?accountId='+bank.id,{},token);
assert(report.some(x=>x.id===transfer.id),'Account-filtered report missing transfer');

console.log('✓ saved customer bank destination');
console.log('✓ saved customer UPI destination');
console.log('✓ separate transfer charge record');
console.log('✓ transfer charge double-entry balances');
console.log('✓ invalid multiple destinations rejected');
console.log('TRANSFER E2E PASS');
