import { randomBytes } from 'node:crypto';

const base = 'http://127.0.0.1:4002/api';
const email = process.env.OWNER_EMAIL;
const password = process.env.OWNER_TEMP_PASSWORD;
if (!email || !password) throw new Error('Owner test credentials missing');

async function request(path, options = {}, token) {
  const headers = new Headers(options.headers || {});
  headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', 'Bearer ' + token);
  const res = await fetch(base + path, { ...options, headers });
  const bodyText = await res.text();
  let body = null;
  try { body = bodyText ? JSON.parse(bodyText) : null; } catch { body = bodyText; }
  if (!res.ok) {
    throw new Error((options.method || 'GET') + ' ' + path + ' -> ' + res.status + ' ' + JSON.stringify(body));
  }
  return { status: res.status, body };
}

function close(actual, expected, label) {
  if (Math.abs(Number(actual) - Number(expected)) > 0.01) {
    throw new Error(label + ': expected ' + expected + ', got ' + actual);
  }
}

const suffix = Date.now().toString(36);
const login = await request('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
});
const token = login.body.accessToken;
if (!token) throw new Error('Owner login did not return token');
console.log('✓ owner login');
const provider = (await request('/providers', {
  method: 'POST',
  body: JSON.stringify({ name: 'E2E Provider ' + suffix, providerType: 'MULTI_SERVICE' }),
}, token)).body;

const gateway = (await request('/providers/' + provider.id + '/gateways', {
  method: 'POST',
  body: JSON.stringify({
    gatewayName: 'E2E Gateway',
    defaultChargeType: 'PERCENTAGE',
    defaultChargeRate: 2,
  }),
}, token)).body;

async function createAccount(accountName, accountType, accountNature, openingBalance, extra = {}) {
  return (await request('/accounts', {
    method: 'POST',
    body: JSON.stringify({
      accountName: accountName + ' ' + suffix,
      accountType,
      accountNature,
      usageType: 'MIXED',
      openingBalance,
      ...extra,
    }),
  }, token)).body;
}

const cash = await createAccount('E2E Cash', 'CASH', 'ASSET', 100000);
const bank = await createAccount('E2E Bank', 'BANK', 'ASSET', 500000);
const wallet = await createAccount('E2E Wallet', 'PROVIDER_WALLET', 'ASSET', 0, { providerId: provider.id });
const ownerCard = await createAccount('E2E Owner Card', 'OWNER_CREDIT_CARD', 'LIABILITY', 0, { creditLimit: 100000 });

console.log('✓ provider, gateway and financial accounts');
const customer = (await request('/customers', {
  method: 'POST',
  body: JSON.stringify({
    customerType: 'REGULAR',
    fullName: 'E2E Customer ' + suffix,
    mobile: '9000000000',
  }),
}, token)).body;

const card = (await request('/customers/' + customer.id + '/cards', {
  method: 'POST',
  body: JSON.stringify({
    bankName: 'E2E Card Bank',
    cardType: 'CREDIT',
    lastFourDigits: '4242',
  }),
}, token)).body;

await request('/customers/' + customer.id + '/banks', {
  method: 'POST',
  body: JSON.stringify({
    accountHolderName: customer.fullName,
    bankName: 'Customer Bank',
    accountReference: 'XXXX1234',
    ifsc: 'TEST0001234',
  }),
}, token);

await request('/customers/' + customer.id + '/upi', {
  method: 'POST',
  body: JSON.stringify({
    accountName: customer.fullName,
    upiId: 'e2e' + suffix + '@upi',
    providerName: 'GPay',
  }),
}, token);

const beneficiary = (await request('/customers/' + customer.id + '/beneficiaries', {
  method: 'POST',
  body: JSON.stringify({
    beneficiaryName: 'E2E Beneficiary',
    relationshipNote: 'Family',
  }),
}, token)).body;

const beneficiaryAccount = (await request('/customers/beneficiaries/' + beneficiary.id + '/accounts', {
  method: 'POST',
  body: JSON.stringify({
    accountType: 'BANK',
    bankName: 'Beneficiary Bank',
    accountReference: 'XXXX9876',
    ifsc: 'TEST0009876',
  }),
}, token)).body;

const customerDetail = (await request('/customers/' + customer.id, {}, token)).body;
if (!customerDetail.bankAccounts.length || !customerDetail.upiAccounts.length || !customerDetail.beneficiaries.length) {
  throw new Error('Customer master details missing');
}
console.log('✓ customer cards, bank, UPI and beneficiary');
const terms = (await request('/settings/payment-terms', {}, token)).body;
const term = terms.find((x) => x.name === '7 Days') || terms[0];
const categories = (await request('/settings/expense-categories', {}, token)).body;
const businessCategory = categories.find((x) => x.name === 'Office Expense') || categories.find((x) => x.expenseUsage !== 'PERSONAL');
const personalCategory = categories.find((x) => x.expenseUsage === 'PERSONAL') || categories[0];

await request('/settings/commission-rules', {
  method: 'POST',
  body: JSON.stringify({
    customerId: customer.id,
    providerId: provider.id,
    gatewayId: gateway.id,
    paymentTermId: term.id,
    transactionType: 'CARD_SWIPE',
    commissionType: 'PERCENTAGE',
    commissionRate: 3,
  }),
}, token);

const resolveQuery = new URLSearchParams({
  transactionType: 'CARD_SWIPE',
  customerId: customer.id,
  providerId: provider.id,
  gatewayId: gateway.id,
  paymentTermId: term.id,
});
const resolved = (await request('/settings/commission-rules/resolve?' + resolveQuery.toString(), {}, token)).body;
close(resolved.commissionRate, 3, 'resolved commission');

const cashOpen = (await request('/cash-counter/open', {
  method: 'POST',
  body: JSON.stringify({
    cashAccountId: cash.id,
    denominations: [{ denomination: 500, quantity: 200 }],
  }),
}, token)).body;
close(cashOpen.openingTotal, 100000, 'cash opening');
console.log('✓ settings, commission resolution and cash opening');
const dueAt = new Date(Date.now() + 7 * 86400000).toISOString();

const swipeResult = (await request('/transactions/card-swipe', {
  method: 'POST',
  body: JSON.stringify({
    customerId: customer.id,
    customerCardId: card.id,
    swipeAmount: 50000,
    providerId: provider.id,
    gatewayId: gateway.id,
    providerChargeRate: 2,
    commissionRate: 3,
    paymentTermId: term.id,
    dueAt,
    settlementAccountId: wallet.id,
    referenceNumber: 'E2E-SWIPE-' + suffix,
  }),
}, token)).body;
close(swipeResult.payable.originalAmount, 47500, 'card payable');

await request('/payables/' + swipeResult.payable.id + '/payments', {
  method: 'POST',
  body: JSON.stringify({
    amount: 20000,
    sourceAccountId: bank.id,
    referenceNumber: 'E2E-PAYOUT-' + suffix,
  }),
}, token);

const payableAfter = (await request('/payables/' + swipeResult.payable.id, {}, token)).body;
close(payableAfter.remainingAmount, 27500, 'remaining payable');
if (payableAfter.status !== 'PARTIALLY_PAID') {
  throw new Error('Payable not PARTIALLY_PAID: ' + payableAfter.status);
}
console.log('✓ card swipe, payable and partial payout');
await request('/transactions/cash-transfer', {
  method: 'POST',
  body: JSON.stringify({
    customerId: customer.id,
    beneficiaryId: beneficiary.id,
    beneficiaryAccountId: beneficiaryAccount.id,
    requestedAmount: 3000,
    commissionMethod: 'ADD_ON',
    commissionRate: 2,
    cashAccountId: cash.id,
    sourceAccountId: bank.id,
    referenceNumber: 'E2E-CTR-' + suffix,
  }),
}, token);

await request('/transactions/aeps', {
  method: 'POST',
  body: JSON.stringify({
    customerId: customer.id,
    aadhaarLastFour: '1234',
    customerBankName: 'Customer Bank',
    withdrawalAmount: 10000,
    providerId: provider.id,
    gatewayId: gateway.id,
    platformChargeRate: 0.5,
    commissionRate: 1,
    cashAccountId: cash.id,
    settlementAccountId: wallet.id,
    providerReference: 'E2E-AEPS-' + suffix,
  }),
}, token);

const internal = (await request('/transactions/internal-transfer', {
  method: 'POST',
  body: JSON.stringify({
    sourceAccountId: bank.id,
    destinationAccountId: wallet.id,
    transferAmount: 5000,
    chargeAmount: 10,
    referenceNumber: 'E2E-INT-' + suffix,
  }),
}, token)).body;

await request('/transactions/expense', {
  method: 'POST',
  body: JSON.stringify({
    expenseType: 'BUSINESS',
    expenseCategoryId: businessCategory.id,
    amount: 500,
    paymentAccountId: bank.id,
    description: 'E2E business expense',
  }),
}, token);

await request('/transactions/expense', {
  method: 'POST',
  body: JSON.stringify({
    expenseType: 'PERSONAL',
    expenseCategoryId: personalCategory.id,
    amount: 1000,
    paymentAccountId: ownerCard.id,
    description: 'E2E personal card expense',
  }),
}, token);

console.log('✓ cash transfer, AePS, internal transfer and expenses');
await request('/transactions/atm-withdrawal', {
  method: 'POST',
  body: JSON.stringify({
    bankAccountId: bank.id,
    cashAccountId: cash.id,
    cashReceived: 2000,
    atmCharge: 20,
    referenceNumber: 'E2E-ATM-' + suffix,
  }),
}, token);

await request('/transactions/owner-credit-card-payment', {
  method: 'POST',
  body: JSON.stringify({
    creditCardAccountId: ownerCard.id,
    sourceAccountId: bank.id,
    paymentAmount: 400,
    referenceNumber: 'E2E-CCPAY-' + suffix,
  }),
}, token);

const summary = (await request('/dashboard/summary', {}, token)).body;
close(summary.cashBalance, 95160, 'cash balance');
close(summary.bankBalance, 469070, 'bank balance');
close(summary.walletBalance, 63950, 'wallet balance');
close(summary.creditCardOutstanding, 600, 'credit card outstanding');
close(summary.creditCardAvailable, 99400, 'credit card available');
close(summary.customerPayable, 27500, 'customer payable');
console.log('✓ ATM, owner credit-card payment and dashboard balances');

const closed = (await request('/cash-counter/' + cashOpen.id + '/close', {
  method: 'POST',
  body: JSON.stringify({
    denominations: [
      { denomination: 500, quantity: 190 },
      { denomination: 100, quantity: 1 },
      { denomination: 20, quantity: 3 },
    ],
    notes: 'E2E exact close',
  }),
}, token)).body;
close(closed.expectedClosingTotal, 95160, 'expected cash closing');
close(closed.actualClosingTotal, 95160, 'actual cash closing');
close(closed.differenceAmount, 0, 'cash difference');
console.log('✓ cash counter close');
const txReport = (await request('/reports/transactions?providerId=' + provider.id, {}, token)).body;
if (txReport.length < 2) throw new Error('Provider report filter returned too few rows');

const accountReport = (await request('/reports/accounts/' + bank.id, {}, token)).body;
if (!accountReport.rows.length) throw new Error('Account ledger is empty');

const searchResult = (await request('/search?q=' + encodeURIComponent(customer.fullName), {}, token)).body;
if (!searchResult.customers.some((x) => x.id === customer.id)) {
  throw new Error('Global search did not find the customer');
}
console.log('✓ reports, account ledger and search');

const staffEmail = 'e2e.' + suffix + '@cashledger.local';
const staffPassword = 'T' + randomBytes(9).toString('hex') + 'a1';
await request('/users', {
  method: 'POST',
  body: JSON.stringify({
    fullName: 'E2E Staff',
    email: staffEmail,
    password: staffPassword,
    role: 'STAFF',
  }),
}, token);

const staffLogin = (await request('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: staffEmail, password: staffPassword }),
})).body;
const staffToken = staffLogin.accessToken;
if (!staffToken) throw new Error('Staff login failed');

await request('/settings/payment-terms', {}, staffToken);
await request('/settings/expense-categories', {}, staffToken);

const forbidden = await fetch(base + '/accounts', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: 'Bearer ' + staffToken,
  },
  body: JSON.stringify({
    accountName: 'Forbidden ' + suffix,
    accountType: 'BANK',
    accountNature: 'ASSET',
    usageType: 'BUSINESS',
    openingBalance: 0,
  }),
});
if (forbidden.status !== 403) {
  throw new Error('Staff account creation should return 403, got ' + forbidden.status);
}
console.log('✓ staff read/write permissions');
await request('/transactions/' + internal.id + '/reverse', {
  method: 'POST',
  body: JSON.stringify({ reason: 'E2E reversal validation' }),
}, token);

const reversed = (await request('/transactions/' + internal.id, {}, token)).body;
if (reversed.status !== 'REVERSED') {
  throw new Error('Original transaction was not marked REVERSED');
}

const audit = (await request('/audit?entityType=TRANSACTION&entityId=' + internal.id, {}, token)).body;
if (!audit.some((x) => x.action === 'REVERSE')) {
  throw new Error('Reversal audit entry missing');
}

const afterReverse = (await request('/dashboard/summary', {}, token)).body;
close(afterReverse.bankBalance, 474080, 'bank after reversal');
close(afterReverse.walletBalance, 58950, 'wallet after reversal');

console.log('✓ reversal, audit and post-reversal balances');

const txPaged = (await request('/transactions?page=1&pageSize=5&sortBy=transactionAt&sortDir=desc', {}, token)).body;
if (!Array.isArray(txPaged.items) || txPaged.pagination.page !== 1 || txPaged.pagination.pageSize !== 5) {
  throw new Error('Transaction pagination response invalid');
}
const customerPaged = (await request('/customers?page=1&pageSize=5&sortBy=fullName&sortDir=asc&includeInactive=true', {}, token)).body;
if (!Array.isArray(customerPaged.items) || customerPaged.pagination.pageSize !== 5) {
  throw new Error('Customer pagination response invalid');
}
const payablePaged = (await request('/payables?page=1&pageSize=5&sortBy=dueAt&sortDir=asc', {}, token)).body;
if (!Array.isArray(payablePaged.items) || payablePaged.pagination.pageSize !== 5) {
  throw new Error('Payable pagination response invalid');
}
console.log('✓ pagination and sorting');

const gatewayReport = (await request('/reports/transactions?gatewayId=' + gateway.id, {}, token)).body;
if (!gatewayReport.some((x) => x.transactionType === 'CARD_SWIPE')) {
  throw new Error('Gateway report filter did not return card swipe');
}
const customerLedger = (await request('/reports/customers/' + customer.id, {}, token)).body;
if (customerLedger.customer.id !== customer.id || !customerLedger.transactions.length) {
  throw new Error('Customer ledger response invalid');
}
const dashboardComplete = (await request('/dashboard/summary', {}, token)).body;
if (!dashboardComplete.payableBreakdown || typeof dashboardComplete.payableBreakdown.overdueAmount !== 'number') {
  throw new Error('Dashboard payable breakdown missing');
}
const todayComplete = (await request('/dashboard/today', {}, token)).body;
for (const field of ['bankIn','bankOut','walletIn','walletOut','upiIn','upiOut']) {
  if (typeof todayComplete[field] !== 'number') throw new Error('Dashboard today field missing: ' + field);
}
for (const type of ['CASH','BANK','UPI','WALLET','TOTAL','CUSTOMER_PAYABLE']) {
  const rows = (await request('/dashboard/last-10-days?type=' + type, {}, token)).body;
  if (!Array.isArray(rows) || rows.length !== 10) throw new Error('10-day series invalid for ' + type);
}
console.log('✓ dashboard breakdowns, selectable 10-day series and report filters');

const duplicateBody = {
  sourceAccountId: bank.id,
  destinationAccountId: wallet.id,
  transferAmount: 1234,
  chargeAmount: 0,
  referenceNumber: 'E2E-DUPE-' + suffix,
};
const dedupeTx = (await request('/transactions/internal-transfer', {
  method: 'POST',
  body: JSON.stringify(duplicateBody),
}, token)).body;
const duplicateResponse = await fetch(base + '/transactions/internal-transfer', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
  body: JSON.stringify(duplicateBody),
});
if (duplicateResponse.status !== 409) {
  throw new Error('Duplicate request should return 409, got ' + duplicateResponse.status);
}
await request('/transactions/' + dedupeTx.id + '/reverse', {
  method: 'POST',
  body: JSON.stringify({ reason: 'Restore E2E duplicate-protection test' }),
}, token);
console.log('✓ duplicate-submit protection');

const cancelSwipe = (await request('/transactions/card-swipe', {
  method: 'POST',
  body: JSON.stringify({
    customerId: customer.id,
    customerCardId: card.id,
    swipeAmount: 1000,
    providerId: provider.id,
    gatewayId: gateway.id,
    providerChargeRate: 2,
    commissionRate: 3,
    paymentTermId: term.id,
    dueAt,
    settlementAccountId: wallet.id,
    referenceNumber: 'E2E-CANCEL-' + suffix,
  }),
}, token)).body;
await request('/payables/' + cancelSwipe.payable.id + '/cancel', {
  method: 'POST',
  body: JSON.stringify({ reason: 'E2E payable cancellation' }),
}, token);
const cancelledPayable = (await request('/payables/' + cancelSwipe.payable.id, {}, token)).body;
if (cancelledPayable.status !== 'CANCELLED' || Number(cancelledPayable.remainingAmount) !== 0) {
  throw new Error('Payable cancellation did not complete correctly');
}
const cancelledSource = (await request('/transactions/' + cancelSwipe.transaction.id, {}, token)).body;
if (cancelledSource.status !== 'REVERSED') throw new Error('Cancelled payable source transaction was not reversed');
console.log('✓ payable cancellation with balanced reversal');

await request('/accounts/' + bank.id, {
  method: 'PATCH',
  body: JSON.stringify({ accountName: 'E2E Bank Edited ' + suffix, usageType: 'BUSINESS' }),
}, token);
await request('/accounts/' + bank.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: false }) }, token);
await request('/accounts/' + bank.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: true }) }, token);

await request('/providers/' + provider.id, {
  method: 'PATCH',
  body: JSON.stringify({ name: 'E2E Provider Edited ' + suffix, providerType: 'MULTI_SERVICE' }),
}, token);
await request('/providers/gateways/' + gateway.id, {
  method: 'PATCH',
  body: JSON.stringify({ gatewayName: 'E2E Gateway Edited', defaultChargeType: 'PERCENTAGE', defaultChargeRate: 2.25 }),
}, token);
await request('/providers/' + provider.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: false }) }, token);
await request('/providers/' + provider.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: true }) }, token);
await request('/providers/gateways/' + gateway.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: false }) }, token);
await request('/providers/gateways/' + gateway.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: true }) }, token);

await request('/settings/payment-terms/' + term.id, {
  method: 'PATCH',
  body: JSON.stringify({ defaultCommissionRate: 3.25 }),
}, token);
await request('/settings/payment-terms/' + term.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: false }) }, token);
await request('/settings/payment-terms/' + term.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: true }) }, token);
await request('/settings/expense-categories/' + businessCategory.id, {
  method: 'PATCH',
  body: JSON.stringify({ expenseUsage: 'BUSINESS' }),
}, token);
await request('/settings/expense-categories/' + businessCategory.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: false }) }, token);
await request('/settings/expense-categories/' + businessCategory.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: true }) }, token);
const allRules = (await request('/settings/commission-rules?includeInactive=true', {}, token)).body;
const e2eRule = allRules.find((x) => x.customerId === customer.id && x.gatewayId === gateway.id);
if (!e2eRule) throw new Error('E2E commission rule not found for lifecycle test');
await request('/settings/commission-rules/' + e2eRule.id, {
  method: 'PATCH',
  body: JSON.stringify({ commissionRate: 3.5 }),
}, token);
await request('/settings/commission-rules/' + e2eRule.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: false }) }, token);
await request('/settings/commission-rules/' + e2eRule.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: true }) }, token);
console.log('✓ account, provider, gateway and settings lifecycle controls');

await request('/customers/' + customer.id, {
  method: 'PATCH',
  body: JSON.stringify({ notes: 'E2E edited customer' }),
}, token);
await request('/customers/' + customer.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: false }) }, token);
await request('/customers/' + customer.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: true }) }, token);
const detailForLifecycle = (await request('/customers/' + customer.id, {}, token)).body;
const bankItem = detailForLifecycle.bankAccounts[0];
const upiItem = detailForLifecycle.upiAccounts[0];
await request('/customers/cards/' + card.id, { method: 'PATCH', body: JSON.stringify({ nickname: 'E2E Card Edited' }) }, token);
await request('/customers/cards/' + card.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: false }) }, token);
await request('/customers/cards/' + card.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: true }) }, token);
await request('/customers/banks/' + bankItem.id, { method: 'PATCH', body: JSON.stringify({ ifsc: 'EDIT0001234' }) }, token);
await request('/customers/banks/' + bankItem.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: false }) }, token);
await request('/customers/banks/' + bankItem.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: true }) }, token);
await request('/customers/upi/' + upiItem.id, { method: 'PATCH', body: JSON.stringify({ providerName: 'PhonePe' }) }, token);
await request('/customers/upi/' + upiItem.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: false }) }, token);
await request('/customers/upi/' + upiItem.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: true }) }, token);
await request('/customers/beneficiaries/' + beneficiary.id, { method: 'PATCH', body: JSON.stringify({ relationshipNote: 'Family Edited' }) }, token);
await request('/customers/beneficiaries/' + beneficiary.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: false }) }, token);
await request('/customers/beneficiaries/' + beneficiary.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: true }) }, token);
await request('/customers/beneficiary-accounts/' + beneficiaryAccount.id, { method: 'PATCH', body: JSON.stringify({ ifsc: 'EDIT0009876' }) }, token);
await request('/customers/beneficiary-accounts/' + beneficiaryAccount.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: false }) }, token);
await request('/customers/beneficiary-accounts/' + beneficiaryAccount.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: true }) }, token);
console.log('✓ customer and saved-detail lifecycle controls');

const users = (await request('/users', {}, token)).body;
const staffUser = users.find((x) => x.email === staffEmail);
if (!staffUser) throw new Error('Staff user not found for lifecycle test');
await request('/users/' + staffUser.id, {
  method: 'PATCH',
  body: JSON.stringify({ fullName: 'E2E Staff Edited', role: 'STAFF' }),
}, token);
await request('/users/' + staffUser.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: false }) }, token);
await request('/users/' + staffUser.id + '/active', { method: 'PATCH', body: JSON.stringify({ isActive: true }) }, token);
const resetPassword = 'R' + randomBytes(10).toString('hex') + 'z9';
await request('/users/' + staffUser.id + '/reset-password', {
  method: 'POST',
  body: JSON.stringify({ password: resetPassword }),
}, token);
const relogin = await request('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: staffEmail, password: resetPassword }),
});
if (!relogin.body.accessToken) throw new Error('Reset password login failed');
console.log('✓ user edit, disable/reactivate and password reset');

const accountAudit = (await request('/audit?entityType=FINANCIAL_ACCOUNT&entityId=' + bank.id, {}, token)).body;
if (!accountAudit.some((x) => x.action === 'CREATE') || !accountAudit.some((x) => x.action === 'UPDATE')) {
  throw new Error('Account audit coverage incomplete');
}
const customerAudit = (await request('/audit?entityType=CUSTOMER&entityId=' + customer.id, {}, token)).body;
if (!customerAudit.some((x) => x.action === 'CREATE') || !customerAudit.some((x) => x.action === 'UPDATE')) {
  throw new Error('Customer audit coverage incomplete');
}
const cashAudit = (await request('/audit?entityType=CASH_SESSION&entityId=' + cashOpen.id, {}, token)).body;
if (!cashAudit.some((x) => x.action === 'OPEN') || !cashAudit.some((x) => x.action === 'CLOSE')) {
  throw new Error('Cash session audit coverage incomplete');
}
console.log('✓ expanded audit coverage');

console.log('E2E PASS');
