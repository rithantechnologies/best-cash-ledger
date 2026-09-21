import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const localBase = 'http://127.0.0.1:4001/api';
const publicBase = 'https://demo.rithantechnologies.com/cashledger/api';
const MARK = 'SEP26-E2E';
const suffix = Date.now().toString(36);
const ownerEmail = 'sep26-e2e-owner@cashledger.local';
const ownerPassword = 'S26!' + randomBytes(12).toString('hex') + 'a1';

function assert(value, message) {
  if (!value) throw new Error(message);
}
function near(a, b, tolerance = 0.01) {
  return Math.abs(Number(a) - Number(b)) <= tolerance;
}
async function raw(base, path, options = {}, token) {
  const headers = new Headers(options.headers || {});
  headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', 'Bearer ' + token);
  const res = await fetch(base + path, { ...options, headers });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}
async function req(base, path, options = {}, token) {
  const r = await raw(base, path, options, token);
  if (r.status < 200 || r.status >= 300) {
    throw new Error((options.method || 'GET') + ' ' + path + ' -> ' + r.status + ' ' + JSON.stringify(r.body));
  }
  return r.body;
}
function ref(label) {
  return MARK + '-' + label + '-' + suffix;
}
function sep(day) {
  return new Date('2026-09-' + String(day).padStart(2, '0') + 'T06:30:00.000Z');
}
async function stampId(id, day) {
  if (!id) return;
  const d = sep(day);
  await prisma.transaction.update({ where: { id }, data: { transactionAt: d } });
  await prisma.ledgerJournal.updateMany({ where: { transactionId: id }, data: { postingDate: d } });
  await prisma.payablePayment.updateMany({ where: { transactionId: id }, data: { paymentDate: d } });
  await prisma.receivableCollection.updateMany({ where: { transactionId: id }, data: { collectionDate: d } });
  await prisma.providerSettlementReceipt.updateMany({ where: { transactionId: id }, data: { receivedAt: d } });
}
async function stampRef(referenceNumber, day) {
  const tx = await prisma.transaction.findFirst({
    where: { referenceNumber },
    orderBy: { createdAt: 'desc' },
  });
  assert(tx, 'Could not find transaction for ' + referenceNumber);
  await stampId(tx.id, day);
  return tx;
}

const ownerRole = await prisma.role.findUnique({ where: { name: 'OWNER' } });
assert(ownerRole, 'OWNER role missing');
const passwordHash = await bcrypt.hash(ownerPassword, 12);
await prisma.user.upsert({
  where: { email: ownerEmail },
  update: { fullName: 'SEP26 E2E Owner', passwordHash, roleId: ownerRole.id, isActive: true },
  create: { fullName: 'SEP26 E2E Owner', email: ownerEmail, passwordHash, roleId: ownerRole.id, isActive: true },
});
console.log('✓ isolated SEP26 owner test user ready');

const login = await req(localBase, '/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
});
const token = login.accessToken;
assert(token, 'Local owner login failed');
console.log('✓ local login through auth API');

async function createAccount(name, type, nature, openingBalance, extra = {}) {
  return req(localBase, '/accounts', {
    method: 'POST',
    body: JSON.stringify({
      accountName: MARK + ' ' + name + ' ' + suffix,
      accountType: type,
      accountNature: nature,
      usageType: 'MIXED',
      openingBalance,
      ...extra,
    }),
  }, token);
}

const provider = await req(localBase, '/providers', {
  method: 'POST',
  body: JSON.stringify({ name: MARK + ' PayNet ' + suffix, providerType: 'MULTI_SERVICE', notes: MARK }),
}, token);
const gateway = await req(localBase, '/providers/' + provider.id + '/gateways', {
  method: 'POST',
  body: JSON.stringify({ gatewayName: 'September Gateway', defaultChargeType: 'PERCENTAGE', defaultChargeRate: 2 }),
}, token);
const cash = await createAccount('Cash Counter', 'CASH', 'ASSET', 120000);
const bank = await createAccount('HDFC Bank', 'BANK', 'ASSET', 350000, { bankName: 'HDFC Bank', accountReference: 'SEP260001' });
const upi = await createAccount('UPI', 'UPI', 'ASSET', 40000);
const ownerCard = await createAccount('Owner Credit Card', 'OWNER_CREDIT_CARD', 'LIABILITY', 0, { creditLimit: 200000, lastFourDigits: '2609' });
const allAccounts = await req(localBase, '/accounts', {}, token);
const wallet = allAccounts.find((x) => x.providerId === provider.id && x.accountType === 'PROVIDER_WALLET');
assert(wallet, 'Provider wallet was not auto-created');
console.log('✓ provider, gateway, cash/bank/UPI/card/wallet accounts');

const mobileStem = String(Date.now()).slice(-8);
const customer = await req(localBase, '/customers', {
  method: 'POST',
  body: JSON.stringify({
    customerType: 'REGULAR',
    fullName: MARK + ' Arun Kumar ' + suffix,
    mobile: '9' + mobileStem + '1',
    notes: MARK + ' primary September customer',
  }),
}, token);
const customer2 = await req(localBase, '/customers', {
  method: 'POST',
  body: JSON.stringify({
    customerType: 'REGULAR',
    fullName: MARK + ' Meena S ' + suffix,
    mobile: '8' + mobileStem + '2',
    notes: MARK + ' secondary September customer',
  }),
}, token);
const card = await req(localBase, '/customers/' + customer.id + '/cards', {
  method: 'POST',
  body: JSON.stringify({ bankName: 'ICICI Bank', cardType: 'CREDIT', lastFourDigits: '4242', nickname: 'September card' }),
}, token);
await req(localBase, '/customers/' + customer.id + '/banks', {
  method: 'POST',
  body: JSON.stringify({ accountHolderName: customer.fullName, bankName: 'SBI', accountReference: 'XXXX2601', ifsc: 'SBIN0002601' }),
}, token);
await req(localBase, '/customers/' + customer.id + '/upi', {
  method: 'POST',
  body: JSON.stringify({ accountName: customer.fullName, upiId: 'sep26.' + suffix + '@upi', providerName: 'GPay' }),
}, token);
const beneficiary = await req(localBase, '/customers/' + customer.id + '/beneficiaries', {
  method: 'POST',
  body: JSON.stringify({ beneficiaryName: MARK + ' Family Beneficiary', relationshipNote: 'Family', notes: MARK }),
}, token);
const beneficiaryAccount = await req(localBase, '/customers/beneficiaries/' + beneficiary.id + '/accounts', {
  method: 'POST',
  body: JSON.stringify({ accountType: 'BANK', bankName: 'Axis Bank', accountReference: 'XXXX2602', ifsc: 'UTIB0002602' }),
}, token);
console.log('✓ customers, card, bank, UPI and beneficiary masters');

const terms = await req(localBase, '/settings/payment-terms', {}, token);
const term = terms.find((x) => x.name === '7 Days') || terms[0];
assert(term, 'No payment term configured');
const categories = await req(localBase, '/settings/expense-categories', {}, token);
const businessCategories = categories.filter((x) => x.expenseUsage !== 'PERSONAL');
const personalCategory = categories.find((x) => x.expenseUsage === 'PERSONAL') || categories[0];
assert(businessCategories.length && personalCategory, 'Expense categories missing');
await req(localBase, '/settings/commission-rules', {
  method: 'POST',
  body: JSON.stringify({
    customerId: customer.id,
    providerId: provider.id,
    gatewayId: gateway.id,
    paymentTermId: term.id,
    transactionType: 'CARD_SWIPE',
    commissionType: 'PERCENTAGE',
    commissionRate: 2.5,
  }),
}, token);

const swipe1Ref = ref('SWIPE-PARTIAL');
const swipe1 = await req(localBase, '/transactions/card-swipe', {
  method: 'POST',
  body: JSON.stringify({
    customerId: customer.id,
    customerCardId: card.id,
    swipeAmount: 20000,
    providerId: provider.id,
    gatewayId: gateway.id,
    providerChargeRate: 2,
    commissionRate: 2.5,
    paymentTermId: term.id,
    dueAt: '2026-09-10T12:00:00.000Z',
    settlementDueAt: '2026-09-05T12:00:00.000Z',
    settlementAccountId: wallet.id,
    referenceNumber: swipe1Ref,
    notes: MARK + ' partial payable and settlement',
  }),
}, token);
await stampRef(swipe1Ref, 2);
const payoutRef = ref('PAYOUT-PARTIAL');
const payout = await req(localBase, '/payables/' + swipe1.payable.id + '/payments', {
  method: 'POST',
  body: JSON.stringify({ amount: 5000, sourceAccountId: bank.id, referenceNumber: payoutRef, notes: MARK }),
}, token);
await stampRef(payoutRef, 4);
const payableAfter = await req(localBase, '/payables/' + swipe1.payable.id, {}, token);
assert(['PARTIALLY_PAID', 'OVERDUE'].includes(payableAfter.status) && near(payableAfter.remainingAmount, 14100), 'Partial/overdue payable state failed');

const transferRef = ref('CASH-TRANSFER');
await req(localBase, '/transactions/cash-transfer', {
  method: 'POST',
  body: JSON.stringify({
    customerId: customer.id,
    beneficiaryId: beneficiary.id,
    beneficiaryAccountId: beneficiaryAccount.id,
    requestedAmount: 5000,
    commissionMethod: 'ADD_ON',
    commissionRate: 2,
    transferChargeAmount: 10,
    transferChargeType: 'IMPS',
    cashAccountId: cash.id,
    sourceAccountId: bank.id,
    referenceNumber: transferRef,
    notes: MARK,
  }),
}, token);
await stampRef(transferRef, 3);

const aepsRef = ref('AEPS');
await req(localBase, '/transactions/aeps', {
  method: 'POST',
  body: JSON.stringify({
    customerId: customer.id,
    aadhaarLastFour: '1234',
    customerBankName: 'SBI',
    withdrawalAmount: 7500,
    providerId: provider.id,
    gatewayId: gateway.id,
    platformChargeRate: 0.5,
    commissionRate: 1,
    cashAccountId: cash.id,
    settlementAccountId: wallet.id,
    settlementDueAt: '2026-09-08T12:00:00.000Z',
    providerReference: aepsRef,
    notes: MARK,
  }),
}, token);
await stampRef(aepsRef, 5);

const microRef = ref('MICRO-ATM');
await req(localBase, '/transactions/micro-atm', {
  method: 'POST',
  body: JSON.stringify({
    customerId: customer2.id,
    cardLastFour: '7788',
    customerBankName: 'Canara Bank',
    withdrawalAmount: 6000,
    providerId: provider.id,
    gatewayId: gateway.id,
    providerCommissionRate: 0.75,
    cashAccountId: cash.id,
    settlementAccountId: wallet.id,
    settledNow: true,
    providerReference: microRef,
    notes: MARK,
  }),
}, token);
await stampRef(microRef, 6);

const expenseSpecs = [
  [7, 'OFFICE', 850, cash.id, businessCategories[0]],
  [8, 'INTERNET', 1800, bank.id, businessCategories[1] || businessCategories[0]],
  [10, 'TRAVEL', 650, upi.id, businessCategories[2] || businessCategories[0]],
  [17, 'SUPPLIES', 1250, bank.id, businessCategories[3] || businessCategories[0]],
];
for (const [day, label, amount, accountId, category] of expenseSpecs) {
  const r = ref('EXP-' + label);
  await req(localBase, '/transactions/expense', {
    method: 'POST',
    body: JSON.stringify({
      expenseType: category.expenseUsage === 'MIXED' ? 'BUSINESS' : category.expenseUsage,
      expenseCategoryId: category.id,
      amount,
      paymentAccountId: accountId,
      description: MARK + ' ' + label.toLowerCase() + ' expense',
      referenceNumber: r,
      notes: MARK,
    }),
  }, token);
  await stampRef(r, day);
}
const personalRef = ref('EXP-PERSONAL');
await req(localBase, '/transactions/expense', {
  method: 'POST',
  body: JSON.stringify({
    expenseType: 'PERSONAL',
    expenseCategoryId: personalCategory.id,
    amount: 2200,
    paymentAccountId: ownerCard.id,
    description: MARK + ' owner personal purchase',
    referenceNumber: personalRef,
    notes: MARK,
  }),
}, token);
await stampRef(personalRef, 12);

const intRef = ref('BANK-UPI');
await req(localBase, '/transactions/internal-transfer', {
  method: 'POST',
  body: JSON.stringify({ sourceAccountId: bank.id, destinationAccountId: upi.id, transferAmount: 15000, chargeAmount: 5, referenceNumber: intRef, notes: MARK }),
}, token);
await stampRef(intRef, 9);

const atmRef = ref('ATM-WITHDRAWAL');
await req(localBase, '/transactions/atm-withdrawal', {
  method: 'POST',
  body: JSON.stringify({ bankAccountId: bank.id, cashAccountId: cash.id, cashReceived: 10000, atmCharge: 25, referenceNumber: atmRef, notes: MARK }),
}, token);
await stampRef(atmRef, 11);

const ccPayRef = ref('CC-PAYMENT');
await req(localBase, '/transactions/owner-credit-card-payment', {
  method: 'POST',
  body: JSON.stringify({ creditCardAccountId: ownerCard.id, sourceAccountId: bank.id, paymentAmount: 1000, referenceNumber: ccPayRef, notes: MARK }),
}, token);
await stampRef(ccPayRef, 13);

const swipe2Ref = ref('SWIPE-SETTLED');
const swipe2 = await req(localBase, '/transactions/card-swipe', {
  method: 'POST',
  headers: { 'idempotency-key': ref('IDEMP-SWIPE') },
  body: JSON.stringify({
    customerId: customer.id,
    customerCardId: card.id,
    swipeAmount: 12000,
    providerId: provider.id,
    gatewayId: gateway.id,
    providerChargeRate: 2,
    commissionRate: 1.5,
    paymentTermId: term.id,
    dueAt: '2026-09-16T12:00:00.000Z',
    settledNow: true,
    customerPayments: [
      { sourceAccountId: wallet.id, amount: 6000 },
      { sourceAccountId: bank.id, amount: 5580 },
    ],
    referenceNumber: swipe2Ref,
    notes: MARK + ' settled immediately using two payout sources',
  }),
}, token);
await stampRef(swipe2Ref, 9);
for (const t of swipe2.payoutTransactions || []) await stampId(t.id, 9);
assert(swipe2.payable.status === 'PAID', 'Settled swipe payable not PAID');

const rcv1Ref = ref('RCV-PARTIAL');
const rcv1 = await req(localBase, '/receivables', {
  method: 'POST',
  body: JSON.stringify({
    customerId: customer.id,
    amount: 12000,
    sourceAccountId: bank.id,
    reason: 'September business advance',
    reasonCategory: 'ADVANCE',
    description: MARK + ' funded receivable',
    dueAt: '2026-09-18T12:00:00.000Z',
    referenceNumber: rcv1Ref,
    notes: MARK,
  }),
}, token);
await stampRef(rcv1Ref, 14);
const col1Ref = ref('RCV-COLLECT-PARTIAL');
await req(localBase, '/receivables/' + rcv1.receivable.id + '/collections', {
  method: 'POST',
  body: JSON.stringify({ amount: 4000, destinationAccountId: upi.id, referenceNumber: col1Ref, notes: MARK }),
}, token);
await stampRef(col1Ref, 16);
const rcv1Detail = await req(localBase, '/receivables/' + rcv1.receivable.id, {}, token);
assert(['PARTIALLY_RECEIVED', 'OVERDUE'].includes(rcv1Detail.status) && near(rcv1Detail.remainingAmount, 8000), 'Partial/overdue receivable failed');

const legacyRef = ref('RCV-LEGACY');
await req(localBase, '/receivables', {
  method: 'POST',
  body: JSON.stringify({
    customerId: customer2.id,
    amount: 3000,
    reason: 'Opening balance carried forward',
    reasonCategory: 'ADJUSTMENT',
    description: MARK + ' unfunded opening receivable',
    dueAt: '2026-09-12T12:00:00.000Z',
    referenceNumber: legacyRef,
    notes: MARK,
  }),
}, token);
await stampRef(legacyRef, 15);

const rcvFullRef = ref('RCV-FULL');
const rcvFull = await req(localBase, '/receivables', {
  method: 'POST',
  body: JSON.stringify({
    customerId: customer2.id,
    amount: 2500,
    sourceAccountId: cash.id,
    reason: 'Shortage recovery',
    reasonCategory: 'SHORTAGE_RECOVERY',
    description: MARK + ' fully collected receivable',
    dueAt: '2026-09-19T12:00:00.000Z',
    referenceNumber: rcvFullRef,
    notes: MARK,
  }),
}, token);
await stampRef(rcvFullRef, 17);
const colFullRef = ref('RCV-COLLECT-FULL');
await req(localBase, '/receivables/' + rcvFull.receivable.id + '/collections', {
  method: 'POST',
  body: JSON.stringify({ amount: 2500, destinationAccountId: bank.id, referenceNumber: colFullRef, notes: MARK }),
}, token);
await stampRef(colFullRef, 18);
const rcvFullDetail = await req(localBase, '/receivables/' + rcvFull.receivable.id, {}, token);
assert(rcvFullDetail.status === 'RECEIVED', 'Full receivable collection failed');

const settlementRef = ref('SETTLEMENT-PARTIAL');
await req(localBase, '/provider-settlements/' + swipe1.providerSettlement.id + '/receipts', {
  method: 'POST',
  body: JSON.stringify({
    amount: 10000,
    destinationAccountId: bank.id,
    receivedAt: '2026-09-19T12:00:00.000Z',
    referenceNumber: settlementRef,
    notes: MARK,
  }),
}, token);
await stampRef(settlementRef, 19);
const settlementDetail = await req(localBase, '/provider-settlements/' + swipe1.providerSettlement.id, {}, token);
assert(settlementDetail.status === 'PARTIALLY_SETTLED', 'Provider settlement partial status failed');

const cancelRef = ref('SWIPE-CANCEL');
const cancelSwipe = await req(localBase, '/transactions/card-swipe', {
  method: 'POST',
  body: JSON.stringify({
    customerId: customer.id,
    customerCardId: card.id,
    swipeAmount: 1000,
    providerId: provider.id,
    gatewayId: gateway.id,
    providerChargeRate: 2,
    commissionRate: 2.5,
    paymentTermId: term.id,
    dueAt: '2026-09-26T12:00:00.000Z',
    settlementAccountId: wallet.id,
    referenceNumber: cancelRef,
    notes: MARK + ' cancellation scenario',
  }),
}, token);
await stampRef(cancelRef, 19);
await req(localBase, '/payables/' + cancelSwipe.payable.id + '/cancel', {
  method: 'POST',
  body: JSON.stringify({ reason: MARK + ' cancellation test' }),
}, token);
const cancelled = await req(localBase, '/payables/' + cancelSwipe.payable.id, {}, token);
assert(cancelled.status === 'CANCELLED', 'Payable cancellation failed');

const dupeRef = ref('DUPE-TRANSFER');
const dupeBody = {
  sourceAccountId: upi.id,
  destinationAccountId: bank.id,
  transferAmount: 1234,
  chargeAmount: 0,
  referenceNumber: dupeRef,
  notes: MARK + ' duplicate protection',
};
const dupeTx = await req(localBase, '/transactions/internal-transfer', {
  method: 'POST',
  body: JSON.stringify(dupeBody),
}, token);
const duplicate = await raw(localBase, '/transactions/internal-transfer', {
  method: 'POST',
  body: JSON.stringify(dupeBody),
}, token);
assert(duplicate.status === 409, 'Duplicate transaction should be rejected with 409');
await req(localBase, '/transactions/' + dupeTx.id + '/reverse', {
  method: 'POST',
  body: JSON.stringify({ reason: MARK + ' reversal after duplicate test' }),
}, token);
const reversed = await req(localBase, '/transactions/' + dupeTx.id, {}, token);
assert(reversed.status === 'REVERSED', 'Reversal failed');

const staffEmail = 'sep26-e2e-staff-' + suffix + '@cashledger.local';
const staffPassword = 'T' + randomBytes(10).toString('hex') + 'a1';
await req(localBase, '/users', {
  method: 'POST',
  body: JSON.stringify({ fullName: MARK + ' Staff ' + suffix, email: staffEmail, password: staffPassword, role: 'STAFF' }),
}, token);
const staffLogin = await req(localBase, '/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: staffEmail, password: staffPassword }),
});
const forbidden = await raw(localBase, '/accounts', {
  method: 'POST',
  body: JSON.stringify({ accountName: MARK + ' Forbidden', accountType: 'BANK', accountNature: 'ASSET', usageType: 'BUSINESS', openingBalance: 0 }),
}, staffLogin.accessToken);
assert(forbidden.status === 403, 'STAFF account creation should be forbidden');

const dashboardAccounts = await req(localBase, '/dashboard/accounts', {}, token);
const cashNow = dashboardAccounts.find((x) => x.id === cash.id);
assert(cashNow, 'Cash account missing from dashboard');
const cashBalance = Number(cashNow.currentBalance);
assert(Number.isInteger(cashBalance) && cashBalance >= 0, 'Cash test balance is not a non-negative integer');
const denominations = [{ denomination: 1, quantity: cashBalance }];
const session = await req(localBase, '/cash-counter/open', {
  method: 'POST',
  body: JSON.stringify({ cashAccountId: cash.id, denominations }),
}, token);
const closed = await req(localBase, '/cash-counter/' + session.id + '/close', {
  method: 'POST',
  body: JSON.stringify({ denominations, notes: MARK + ' exact E2E close' }),
}, token);
assert(near(closed.differenceAmount, 0), 'Cash close variance should be zero');

const from = encodeURIComponent('2026-09-01T00:00:00.000Z');
const to = encodeURIComponent('2026-09-20T23:59:59.999Z');
const txReport = await req(localBase, '/reports/transactions?from=' + from + '&to=' + to, {}, token);
assert(Array.isArray(txReport) && txReport.length > 0, 'September transaction report empty');
const bankLedger = await req(localBase, '/reports/accounts/' + bank.id + '?from=' + from + '&to=' + to, {}, token);
assert(Array.isArray(bankLedger.rows) && bankLedger.rows.length > 0, 'September bank ledger empty');
const customerLedger = await req(localBase, '/reports/customers/' + customer.id, {}, token);
assert(customerLedger.transactions.length > 0, 'Customer ledger empty');
const search = await req(localBase, '/search?q=' + encodeURIComponent(customer.fullName), {}, token);
assert(search.customers.some((x) => x.id === customer.id), 'Search did not find SEP26 customer');
const series = await req(localBase, '/dashboard/last-10-days?type=TOTAL', {}, token);
assert(Array.isArray(series) && series.length === 10, 'Dashboard 10-day series failed');
const trend = await req(localBase, '/dashboard/position-trend', {}, token);
assert(Array.isArray(trend) && trend.length === 10, 'Position trend failed');
const audit = await req(localBase, '/audit?entityType=TRANSACTION&entityId=' + dupeTx.id, {}, token);
assert(audit.some((x) => x.action === 'REVERSE'), 'Reversal audit missing');

const publicLogin = await req(publicBase, '/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
});
assert(publicLogin.accessToken, 'Public login with isolated test owner failed');
for (const path of [
  '/dashboard/summary',
  '/transactions?page=1&pageSize=5',
  '/payables?page=1&pageSize=5',
  '/receivables?page=1&pageSize=5',
  '/reports/daily-summary',
]) {
  await req(publicBase, path, {}, publicLogin.accessToken);
}
const web = await fetch('https://demo.rithantechnologies.com/cashledger/');
assert(web.ok, 'Public web app did not return 2xx');

const tagged = await prisma.transaction.findMany({
  where: {
    OR: [
      { referenceNumber: { startsWith: MARK } },
      { notes: { contains: MARK } },
    ],
  },
  select: { transactionType: true, status: true, transactionAt: true, referenceNumber: true },
  orderBy: { transactionAt: 'asc' },
});
const thisRun = tagged.filter((x) => (x.referenceNumber || '').endsWith(suffix));
const byType = {};
for (const t of thisRun) byType[t.transactionType] = (byType[t.transactionType] || 0) + 1;

console.log('✓ partial payable, receivable, settlement and full collection paths');
console.log('✓ duplicate rejection, reversal, audit and STAFF permission checks');
console.log('✓ exact cash-counter close');
console.log('✓ September reports, ledgers, search and dashboard trend');
console.log('✓ public API auth/data smoke and public web response');
console.log('SEPTEMBER 2026 E2E PASS');
console.log(JSON.stringify({
  marker: MARK,
  run: suffix,
  customer: customer.fullName,
  customer2: customer2.fullName,
  accounts: [cash.accountName, bank.accountName, upi.accountName, ownerCard.accountName, wallet.accountName],
  taggedTransactionsThisRun: thisRun.length,
  transactionTypes: byType,
  partialPayableRemaining: Number(payableAfter.remainingAmount),
  partialReceivableRemaining: Number(rcv1Detail.remainingAmount),
  partialProviderSettlementRemaining: Number(settlementDetail.remainingAmount),
  cashCloseDifference: Number(closed.differenceAmount),
}, null, 2));

await prisma.$disconnect();
