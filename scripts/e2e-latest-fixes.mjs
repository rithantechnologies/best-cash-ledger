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
  let body=null; try{body=text?JSON.parse(text):null;}catch{body=text;}
  return {status:res.status,body};
}
async function request(path,options={},token){
  const r=await raw(path,options,token);
  if(r.status<200||r.status>=300)throw new Error((options.method||'GET')+' '+path+' -> '+r.status+' '+JSON.stringify(r.body));
  return r.body;
}
function assert(v,m){if(!v)throw new Error(m);}
function dateKey(date){
  const local=new Date(date.getTime()+330*60*1000);
  return [local.getUTCFullYear(),String(local.getUTCMonth()+1).padStart(2,'0'),String(local.getUTCDate()).padStart(2,'0')].join('-');
}

const login=await request('/auth/login',{method:'POST',body:JSON.stringify({email,password})});
const token=login.accessToken;
const suffix=Date.now().toString(36);

async function account(name,type,opening){
  return request('/accounts',{method:'POST',body:JSON.stringify({
    accountName:name+' '+suffix,accountType:type,accountNature:'ASSET',usageType:'MIXED',openingBalance:opening,
  })},token);
}
const bankA=await account('Latest Bank A','BANK',5000);
const bankB=await account('Latest Bank B','BANK',1000);
const cash=await account('Latest Cash','CASH',0);

const internal=await request('/transactions/internal-transfer',{method:'POST',body:JSON.stringify({
  sourceAccountId:bankA.id,destinationAccountId:bankB.id,transferAmount:100,chargeAmount:7,
  referenceNumber:'LATEST-INT-'+suffix,notes:'Unified charge regression',
})},token);
const internalDetail=await request('/transactions/'+internal.id,{},token);
assert(internalDetail.charges.some(x=>x.chargeType==='BANK'&&Number(x.amount)===7),'Internal-transfer charge missing from unified charges');

const atm=await request('/transactions/atm-withdrawal',{method:'POST',body:JSON.stringify({
  bankAccountId:bankA.id,cashAccountId:cash.id,cashReceived:50,atmCharge:5,
  referenceNumber:'LATEST-ATM-'+suffix,notes:'Unified ATM charge regression',
})},token);
const atmDetail=await request('/transactions/'+atm.id,{},token);
assert(atmDetail.charges.some(x=>x.chargeType==='ATM'&&Number(x.amount)===5),'ATM charge missing from unified charges');

const chargeReport=await request('/reports/provider-charges',{},token);
assert(chargeReport.some(x=>x.transactionId===internal.id&&Number(x.amount)===7),'Internal-transfer charge missing from charge report');
assert(chargeReport.some(x=>x.transactionId===atm.id&&Number(x.amount)===5),'ATM charge missing from charge report');
console.log('✓ ATM/internal-transfer fees feed unified charges and reports');

const provider=await request('/providers',{method:'POST',body:JSON.stringify({
  name:'Latest Provider '+suffix,providerType:'MULTI_SERVICE',
})},token);
const gateway=await request('/providers/'+provider.id+'/gateways',{method:'POST',body:JSON.stringify({
  gatewayName:'Latest Gateway',defaultChargeType:'PERCENTAGE',defaultChargeRate:2,
})},token);
const wallet=await request('/accounts',{method:'POST',body:JSON.stringify({
  accountName:'Latest Wallet '+suffix,accountType:'PROVIDER_WALLET',accountNature:'ASSET',
  usageType:'BUSINESS',openingBalance:0,providerId:provider.id,
})},token);
const customer=await request('/customers',{method:'POST',body:JSON.stringify({
  customerType:'REGULAR',fullName:'Latest Payable Customer '+suffix,mobile:'9444444444',
})},token);
const card=await request('/customers/'+customer.id+'/cards',{method:'POST',body:JSON.stringify({
  bankName:'Latest Card Bank',cardType:'CREDIT',lastFourDigits:'7878',nickname:'History',
})},token);
const term=await request('/settings/payment-terms',{method:'POST',body:JSON.stringify({
  name:'Latest Term '+suffix,durationValue:7,durationUnit:'DAYS',
  defaultCommissionType:'PERCENTAGE',defaultCommissionRate:3,
})},token);

const swipe=await request('/transactions/card-swipe',{method:'POST',body:JSON.stringify({
  customerId:customer.id,customerCardId:card.id,swipeAmount:1000,
  providerId:provider.id,gatewayId:gateway.id,providerChargeRate:2,commissionRate:3,
  paymentTermId:term.id,dueAt:new Date(Date.now()+7*86400000).toISOString(),
  settlementAccountId:wallet.id,referenceNumber:'HIST-'+suffix,
})},token);

process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
const {createRequire}=await import('node:module');
const require=createRequire('/var/www/cashledger/apps/api/package.json');
const {PrismaClient}=require('@prisma/client');
const prisma=new PrismaClient();
const pastDate=new Date(Date.now()-2*86400000);
await prisma.ledgerJournal.update({
  where:{transactionId:swipe.transaction.id},
  data:{postingDate:pastDate},
});
await prisma.$disconnect();

await request('/payables/'+swipe.payable.id+'/cancel',{method:'POST',body:JSON.stringify({
  reason:'Historical payable movement regression',
})},token);

const series=await request('/dashboard/last-10-days?type=CUSTOMER_PAYABLE',{},token);
const pastKey=dateKey(pastDate);
const todayKey=dateKey(new Date());
const pastRow=series.find(x=>x.date===pastKey);
const todayRow=series.find(x=>x.date===todayKey);
const payableAmount=Number(swipe.payable.originalAmount);
assert(pastRow&&Number(pastRow.moneyIn)>=payableAmount,'Historical payable creation disappeared from prior day');
assert(todayRow&&Number(todayRow.moneyOut)>=payableAmount,'Payable cancellation not reflected as current-day reduction');
console.log('✓ payable history preserves prior-day creation and later cancellation');
console.log('LATEST FIXES E2E PASS');
