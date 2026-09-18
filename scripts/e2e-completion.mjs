import { randomBytes } from 'node:crypto';

const base = 'http://127.0.0.1:4002/api';
const ownerEmail = process.env.OWNER_EMAIL;
const ownerPassword = process.env.OWNER_TEMP_PASSWORD;
if (!ownerEmail || !ownerPassword) throw new Error('Owner credentials missing');

async function raw(path, options = {}, token) {
  const headers = new Headers(options.headers || {});
  headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', 'Bearer ' + token);
  const res = await fetch(base + path, { ...options, headers });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}
async function request(path, options = {}, token) {
  const result = await raw(path, options, token);
  if (result.status < 200 || result.status >= 300) {
    throw new Error((options.method || 'GET') + ' ' + path + ' -> ' + result.status + ' ' + JSON.stringify(result.body));
  }
  return result.body;
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const suffix = Date.now().toString(36);
const login = await request('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
});
const token = login.accessToken;
assert(token, 'Owner login token missing');
console.log('✓ owner login');

const summary = await request('/dashboard/summary', {}, token);
for (const key of ['pendingAmount','partialAmount','dueTodayAmount','overdueAmount']) {
  assert(key in summary.payableBreakdown, 'Missing payable breakdown ' + key);
}
const today = await request('/dashboard/today', {}, token);
for (const key of ['cashIn','cashOut','bankIn','bankOut','walletIn','walletOut','upiIn','upiOut']) {
  assert(key in today, 'Missing today movement ' + key);
}
for (const type of ['TOTAL','CASH','BANK','UPI','WALLET','CUSTOMER_PAYABLE']) {
  const rows = await request('/dashboard/last-10-days?type=' + type, {}, token);
  assert(Array.isArray(rows) && rows.length === 10, '10-day series failed for ' + type);
}
console.log('✓ dashboard breakdowns and all 10-day modes');

const txPage = await request('/transactions?page=1&pageSize=5&sortBy=transactionNumber&sortDir=asc', {}, token);
assert(Array.isArray(txPage.items) && txPage.items.length <= 5, 'Transaction pagination failed');
assert(txPage.pagination.page === 1 && txPage.pagination.pageSize === 5, 'Transaction pagination metadata failed');
console.log('✓ transaction pagination and sorting');

const provider = await request('/providers', {
  method:'POST',
  body:JSON.stringify({name:'Completion Provider '+suffix,providerType:'MULTI_SERVICE'}),
}, token);
const gateway = await request('/providers/' + provider.id + '/gateways', {
  method:'POST',
  body:JSON.stringify({gatewayName:'Completion Gateway',defaultChargeType:'PERCENTAGE',defaultChargeRate:2}),
}, token);
await request('/providers/' + provider.id, {
  method:'PATCH',
  body:JSON.stringify({name:'Completion Provider Updated '+suffix,providerType:'MULTI_SERVICE'}),
}, token);
await request('/providers/gateways/' + gateway.id, {
  method:'PATCH',
  body:JSON.stringify({gatewayName:'Completion Gateway Updated',defaultChargeType:'PERCENTAGE',defaultChargeRate:2.25}),
}, token);
await request('/providers/gateways/' + gateway.id + '/active', {method:'PATCH',body:JSON.stringify({isActive:false})}, token);
let providerAll = await request('/providers?includeInactive=true', {}, token);
let providerRow = providerAll.find(x => x.id === provider.id);
assert(providerRow.gateways.find(x => x.id === gateway.id).isActive === false, 'Gateway deactivate failed');
await request('/providers/gateways/' + gateway.id + '/active', {method:'PATCH',body:JSON.stringify({isActive:true})}, token);
await request('/providers/' + provider.id + '/active', {method:'PATCH',body:JSON.stringify({isActive:false})}, token);
providerAll = await request('/providers?includeInactive=true', {}, token);
providerRow = providerAll.find(x => x.id === provider.id);
assert(providerRow && providerRow.isActive === false, 'Provider deactivate visibility failed');
await request('/providers/' + provider.id + '/active', {method:'PATCH',body:JSON.stringify({isActive:true})}, token);
console.log('✓ provider/gateway edit, retire and reactivate');

async function createAccount(name, type, nature, openingBalance, extra={}) {
  return request('/accounts', {
    method:'POST',
    body:JSON.stringify({accountName:name+' '+suffix,accountType:type,accountNature:nature,usageType:'MIXED',openingBalance,...extra}),
  }, token);
}
const bankA = await createAccount('Completion Bank A','BANK','ASSET',200000);
const bankB = await createAccount('Completion Bank B','BANK','ASSET',100000);
const wallet = await createAccount('Completion Wallet','PROVIDER_WALLET','ASSET',0,{providerId:provider.id});
await request('/accounts/' + bankA.id, {
  method:'PATCH',
  body:JSON.stringify({accountName:'Completion Bank A Updated '+suffix,usageType:'BUSINESS',bankName:'Lifecycle Bank',accountReference:'XX1234'}),
}, token);
const blockedDeactivate = await raw('/accounts/' + bankA.id + '/active', {method:'PATCH',body:JSON.stringify({isActive:false})}, token);
assert(blockedDeactivate.status===400,'Non-zero account deactivation should be blocked');
const zeroLifecycle = await createAccount('Completion Zero Lifecycle','BANK','ASSET',0);
await request('/accounts/' + zeroLifecycle.id + '/active', {method:'PATCH',body:JSON.stringify({isActive:false})}, token);
let accounts = await request('/accounts', {}, token);
assert(accounts.find(x=>x.id===zeroLifecycle.id)?.isActive === false, 'Zero account deactivate failed');
await request('/accounts/' + zeroLifecycle.id + '/active', {method:'PATCH',body:JSON.stringify({isActive:true})}, token);
console.log('✓ account edit, non-zero protection, retire and reactivate');

const customer = await request('/customers', {
  method:'POST',
  body:JSON.stringify({customerType:'REGULAR',fullName:'Completion Customer '+suffix,mobile:'9111111111'}),
}, token);
await request('/customers/' + customer.id, {
  method:'PATCH',
  body:JSON.stringify({fullName:'Completion Customer Updated '+suffix,mobile:'9222222222',customerType:'REGULAR',notes:'Lifecycle tested'}),
}, token);
const card = await request('/customers/' + customer.id + '/cards', {
  method:'POST',body:JSON.stringify({bankName:'Lifecycle Card Bank',cardType:'CREDIT',lastFourDigits:'5656',nickname:'Primary'}),
}, token);
const bankDetail = await request('/customers/' + customer.id + '/banks', {
  method:'POST',body:JSON.stringify({accountHolderName:'Completion Customer',bankName:'Lifecycle Customer Bank',accountReference:'XXXX1111',ifsc:'TEST0001111'}),
}, token);
const upi = await request('/customers/' + customer.id + '/upi', {
  method:'POST',body:JSON.stringify({accountName:'Completion Customer',upiId:'complete'+suffix+'@upi',providerName:'GPay'}),
}, token);
const beneficiary = await request('/customers/' + customer.id + '/beneficiaries', {
  method:'POST',body:JSON.stringify({beneficiaryName:'Completion Beneficiary',relationshipNote:'Family'}),
}, token);
const beneficiaryAccount = await request('/customers/beneficiaries/' + beneficiary.id + '/accounts', {
  method:'POST',body:JSON.stringify({accountType:'BANK',bankName:'Recipient Bank',accountReference:'XXXX2222',ifsc:'TEST0002222'}),
}, token);

await request('/customers/cards/' + card.id, {method:'PATCH',body:JSON.stringify({nickname:'Updated Card',bankName:'Lifecycle Card Bank',lastFourDigits:'5656'})}, token);
await request('/customers/banks/' + bankDetail.id, {method:'PATCH',body:JSON.stringify({accountHolderName:'Completion Customer Updated',bankName:'Lifecycle Customer Bank 2',accountReference:'XXXX1111',ifsc:'TEST0001111'})}, token);
await request('/customers/upi/' + upi.id, {method:'PATCH',body:JSON.stringify({accountName:'Completion Customer Updated',upiId:'complete'+suffix+'@upi',providerName:'PhonePe'})}, token);
await request('/customers/beneficiaries/' + beneficiary.id, {method:'PATCH',body:JSON.stringify({beneficiaryName:'Completion Beneficiary Updated',relationshipNote:'Family'})}, token);
await request('/customers/beneficiary-accounts/' + beneficiaryAccount.id, {method:'PATCH',body:JSON.stringify({accountType:'BANK',bankName:'Recipient Bank Updated',accountReference:'XXXX2222',ifsc:'TEST0002222'})}, token);

for (const [path,label] of [
  ['/customers/cards/'+card.id,'card'],
  ['/customers/banks/'+bankDetail.id,'bank'],
  ['/customers/upi/'+upi.id,'upi'],
  ['/customers/beneficiaries/'+beneficiary.id,'beneficiary'],
  ['/customers/beneficiary-accounts/'+beneficiaryAccount.id,'beneficiary account'],
]) {
  await request(path + '/active',{method:'PATCH',body:JSON.stringify({isActive:false})},token);
  await request(path + '/active',{method:'PATCH',body:JSON.stringify({isActive:true})},token);
}
await request('/customers/' + customer.id + '/active',{method:'PATCH',body:JSON.stringify({isActive:false})},token);
const inactivePage = await request('/customers?page=1&pageSize=10&q=' + encodeURIComponent(suffix) + '&includeInactive=true',{},token);
assert(inactivePage.items.some(x=>x.id===customer.id && x.isActive===false),'Retired customer not found in paginated inactive list');
await request('/customers/' + customer.id + '/active',{method:'PATCH',body:JSON.stringify({isActive:true})},token);
const customerPage = await request('/customers?page=1&pageSize=5&sortBy=fullName&sortDir=asc&q=' + encodeURIComponent(suffix),{},token);
assert(customerPage.pagination.pageSize===5 && customerPage.items.some(x=>x.id===customer.id),'Customer pagination/search failed');
console.log('✓ customer profile/payment/beneficiary lifecycle and pagination');

const term = await request('/settings/payment-terms',{
  method:'POST',body:JSON.stringify({name:'Completion Term '+suffix,durationValue:3,durationUnit:'DAYS',defaultCommissionType:'PERCENTAGE',defaultCommissionRate:2.5}),
},token);
await request('/settings/payment-terms/'+term.id,{method:'PATCH',body:JSON.stringify({name:'Completion Term Updated '+suffix,durationValue:4,durationUnit:'DAYS',defaultCommissionType:'PERCENTAGE',defaultCommissionRate:2.75})},token);
await request('/settings/payment-terms/'+term.id+'/active',{method:'PATCH',body:JSON.stringify({isActive:false})},token);
let allTerms=await request('/settings/payment-terms?includeInactive=true',{},token);
assert(allTerms.find(x=>x.id===term.id)?.isActive===false,'Term deactivate failed');
await request('/settings/payment-terms/'+term.id+'/active',{method:'PATCH',body:JSON.stringify({isActive:true})},token);

const category = await request('/settings/expense-categories',{
  method:'POST',body:JSON.stringify({name:'Completion Category '+suffix,expenseUsage:'BUSINESS'}),
},token);
await request('/settings/expense-categories/'+category.id,{method:'PATCH',body:JSON.stringify({name:'Completion Category Updated '+suffix,expenseUsage:'MIXED'})},token);
await request('/settings/expense-categories/'+category.id+'/active',{method:'PATCH',body:JSON.stringify({isActive:false})},token);
await request('/settings/expense-categories/'+category.id+'/active',{method:'PATCH',body:JSON.stringify({isActive:true})},token);

const rule = await request('/settings/commission-rules',{
  method:'POST',body:JSON.stringify({customerId:customer.id,providerId:provider.id,gatewayId:gateway.id,paymentTermId:term.id,transactionType:'CARD_SWIPE',commissionType:'PERCENTAGE',commissionRate:3}),
},token);
await request('/settings/commission-rules/'+rule.id,{method:'PATCH',body:JSON.stringify({commissionType:'PERCENTAGE',commissionRate:3.25})},token);
await request('/settings/commission-rules/'+rule.id+'/active',{method:'PATCH',body:JSON.stringify({isActive:false})},token);
let allRules=await request('/settings/commission-rules?includeInactive=true',{},token);
assert(allRules.find(x=>x.id===rule.id)?.isActive===false,'Commission rule deactivate failed');
await request('/settings/commission-rules/'+rule.id+'/active',{method:'PATCH',body:JSON.stringify({isActive:true})},token);
console.log('✓ payment term, category and commission-rule lifecycle');

const transferPayload = {
  sourceAccountId:bankA.id,destinationAccountId:bankB.id,transferAmount:1234,chargeAmount:0,referenceNumber:'DUP-'+suffix,
};
const firstTransfer = await request('/transactions/internal-transfer',{method:'POST',body:JSON.stringify(transferPayload)},token);
const duplicate = await raw('/transactions/internal-transfer',{method:'POST',body:JSON.stringify(transferPayload)},token);
assert(duplicate.status===409,'Duplicate transaction should return 409, got '+duplicate.status);
const txAudit=await request('/audit?entityType=TRANSACTION&entityId='+firstTransfer.id,{},token);
assert(txAudit.some(x=>x.action==='CREATE'),'Transaction create audit missing');
console.log('✓ duplicate-submit protection and create audit');

const swipe = await request('/transactions/card-swipe',{
  method:'POST',
  body:JSON.stringify({
    customerId:customer.id,customerCardId:card.id,swipeAmount:10000,
    providerId:provider.id,gatewayId:gateway.id,providerChargeRate:2,
    commissionRate:3.25,paymentTermId:term.id,
    dueAt:new Date(Date.now()+4*86400000).toISOString(),
    settlementAccountId:wallet.id,referenceNumber:'CANCEL-'+suffix,
  }),
},token);
await request('/payables/'+swipe.payable.id+'/cancel',{method:'POST',body:JSON.stringify({reason:'Completion cancellation test'})},token);
const cancelledPayable=await request('/payables/'+swipe.payable.id,{},token);
assert(cancelledPayable.status==='CANCELLED' && Number(cancelledPayable.remainingAmount)===0,'Payable cancellation failed');
const reversedSource=await request('/transactions/'+swipe.transaction.id,{},token);
assert(reversedSource.status==='REVERSED','Cancelled payable source transaction not reversed');
const cancelAudit=await request('/audit?entityType=CUSTOMER_PAYABLE&entityId='+swipe.payable.id,{},token);
assert(cancelAudit.some(x=>x.action==='CANCEL'),'Payable cancellation audit missing');
console.log('✓ safe payable cancellation and reversal');

const gatewayReport=await request('/reports/transactions?gatewayId='+gateway.id,{},token);
assert(gatewayReport.some(x=>x.id===swipe.transaction.id),'Gateway report filter failed');
const customerLedger=await request('/reports/customers/'+customer.id,{},token);
assert(customerLedger.customer.id===customer.id && Array.isArray(customerLedger.transactions),'Customer ledger failed');
console.log('✓ gateway report filter and customer ledger');

const staffEmail='completion.'+suffix+'@cashledger.local';
const staffPassword='S'+randomBytes(10).toString('hex')+'9';
const staff=await request('/users',{
  method:'POST',body:JSON.stringify({fullName:'Completion Staff',email:staffEmail,password:staffPassword,role:'STAFF'}),
},token);
await request('/users/'+staff.id,{method:'PATCH',body:JSON.stringify({fullName:'Completion Staff Updated',email:staffEmail,role:'STAFF'})},token);
const newPassword='N'+randomBytes(10).toString('hex')+'7';
await request('/users/'+staff.id+'/reset-password',{method:'POST',body:JSON.stringify({password:newPassword})},token);
const oldLogin=await raw('/auth/login',{method:'POST',body:JSON.stringify({email:staffEmail,password:staffPassword})});
assert(oldLogin.status===401,'Old staff password should fail after reset');
const newLogin=await request('/auth/login',{method:'POST',body:JSON.stringify({email:staffEmail,password:newPassword})});
const staffToken=newLogin.accessToken;
await request('/users/'+staff.id+'/active',{method:'PATCH',body:JSON.stringify({isActive:false})},token);
const existingTokenAfterDisable=await raw('/settings/payment-terms',{},staffToken);
assert(existingTokenAfterDisable.status===401,'Disabled user existing token should return 401');
const disabledLogin=await raw('/auth/login',{method:'POST',body:JSON.stringify({email:staffEmail,password:newPassword})});
assert(disabledLogin.status===401,'Disabled user login should return 401');
await request('/users/'+staff.id+'/active',{method:'PATCH',body:JSON.stringify({isActive:true})},token);
const reactivatedLogin=await raw('/auth/login',{method:'POST',body:JSON.stringify({email:staffEmail,password:newPassword})});
assert(reactivatedLogin.status===201,'Reactivated user login failed');
const userAudit=await request('/audit?entityType=USER&entityId='+staff.id,{},token);
for(const action of ['CREATE','UPDATE','PASSWORD_RESET','DEACTIVATE','REACTIVATE']) {
  assert(userAudit.some(x=>x.action===action),'User audit missing '+action);
}
console.log('✓ user edit/reset/disable/reactivate and immediate session enforcement');

const accountAudit=await request('/audit?entityType=FINANCIAL_ACCOUNT&entityId='+bankA.id,{},token);
const zeroAccountAudit=await request('/audit?entityType=FINANCIAL_ACCOUNT&entityId='+zeroLifecycle.id,{},token);
assert(accountAudit.some(x=>x.action==='UPDATE'),'Account update audit missing');
assert(zeroAccountAudit.some(x=>x.action==='DEACTIVATE') && zeroAccountAudit.some(x=>x.action==='REACTIVATE'),'Zero-balance account lifecycle audit incomplete');
const providerAudit=await request('/audit?entityType=PROVIDER&entityId='+provider.id,{},token);
assert(providerAudit.some(x=>x.action==='UPDATE') && providerAudit.some(x=>x.action==='DEACTIVATE') && providerAudit.some(x=>x.action==='REACTIVATE'),'Provider lifecycle audit incomplete');
console.log('✓ lifecycle audit coverage');

console.log('COMPLETION E2E PASS');
