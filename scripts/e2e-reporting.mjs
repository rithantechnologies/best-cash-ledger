const base='http://127.0.0.1:4002/api';
const email=process.env.OWNER_EMAIL;
const password=process.env.OWNER_TEMP_PASSWORD;
if(!email||!password)throw new Error('Owner credentials missing');

async function request(path,options={},token){
  const headers=new Headers(options.headers||{});
  headers.set('content-type','application/json');
  if(token)headers.set('authorization','Bearer '+token);
  const res=await fetch(base+path,{...options,headers});
  const text=await res.text();
  let body=null;
  try{body=text?JSON.parse(text):null;}catch{body=text;}
  if(!res.ok)throw new Error((options.method||'GET')+' '+path+' -> '+res.status+' '+JSON.stringify(body));
  return body;
}
function assert(v,m){if(!v)throw new Error(m);}

const login=await request('/auth/login',{method:'POST',body:JSON.stringify({email,password})});
const token=login.accessToken;
assert(token,'login failed');

let txPage=await request('/transactions?page=1&pageSize=5',{},token);
if(!Array.isArray(txPage.items)||txPage.items.length===0){
  const suffix=Date.now().toString(36);
  const bank=await request('/accounts',{method:'POST',body:JSON.stringify({
    accountName:'Reporting Bank '+suffix,accountType:'BANK',accountNature:'ASSET',usageType:'BUSINESS',openingBalance:1000,
  })},token);
  const customer=await request('/customers',{method:'POST',body:JSON.stringify({
    customerType:'REGULAR',fullName:'Reporting Customer '+suffix,mobile:'9666600001',
  })},token);
  await request('/receivables',{method:'POST',body:JSON.stringify({
    customerId:customer.id,amount:100,reason:'Reporting fixture',reasonCategory:'ADJUSTMENT',
  })},token);
  const categories=await request('/settings/expense-categories',{},token);
  const category=categories.find(x=>x.expenseUsage!=='PERSONAL')||categories[0];
  await request('/transactions/expense',{method:'POST',body:JSON.stringify({
    expenseType:'BUSINESS',expenseCategoryId:category.id,amount:10,paymentAccountId:bank.id,description:'Reporting fixture expense',
  })},token);
  txPage=await request('/transactions?page=1&pageSize=5',{},token);
}
assert(Array.isArray(txPage.items)&&txPage.items.length>0,'no transactions returned');
assert(txPage.items[0].createdBy?.fullName,'transaction operator name missing');

const txDetail=await request('/transactions/'+txPage.items[0].id,{},token);
assert(txDetail.createdBy?.fullName,'transaction detail operator missing');

const txReport=await request('/reports/transactions',{},token);
assert(txReport.length>0&&txReport[0].createdBy?.fullName,'report operator name missing');

const audit=await request('/audit',{},token);
assert(audit.length>0&&audit[0].user?.fullName,'audit operator name missing');

const payables=await request('/payables?page=1&pageSize=5&sortBy=dueAt&sortDir=asc',{},token);
assert(Array.isArray(payables.items)&&payables.pagination.pageSize===5,'payable pagination failed');

const accounts=await request('/accounts',{},token);
assert(accounts.length>0,'no accounts');
const start=new Date();start.setHours(0,0,0,0);
const end=new Date();end.setHours(23,59,59,999);
const ledger=await request('/reports/accounts/'+accounts[0].id+'?from='+encodeURIComponent(start.toISOString())+'&to='+encodeURIComponent(end.toISOString()),{},token);
assert(typeof ledger.openingBalance==='number','ledger opening balance missing');
let running=Number(ledger.openingBalance);
let introduced=Number(ledger.openingBalanceIntroducedInRange||0);
let introducedApplied=false;
for(const row of ledger.rows){
  if(introduced&&!introducedApplied){running+=introduced;introducedApplied=true;}
  const amount=Number(row.amount);
  running += ledger.account.accountNature==='ASSET'
    ? (row.entryType==='DEBIT'?amount:-amount)
    : (row.entryType==='CREDIT'?amount:-amount);
  if(Math.abs(running-Number(row.runningBalance))>0.01)throw new Error('ledger running balance mismatch');
}

const customerWithTx=txReport.find(x=>x.customerId)?.customerId;
if(customerWithTx){
  const customerLedger=await request('/reports/customers/'+customerWithTx,{},token);
  if(customerLedger.transactions.length){
    assert(customerLedger.transactions[0].createdBy?.fullName,'customer ledger operator missing');
  }
}

console.log('✓ transaction operator names');
console.log('✓ audit operator names');
console.log('✓ payable pagination');
console.log('✓ date-filtered ledger opening/running balances');
console.log('✓ customer-ledger operator names');
console.log('REPORTING E2E PASS');
