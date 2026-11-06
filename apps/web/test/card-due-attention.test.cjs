const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../node_modules/typescript");

const input = fs.readFileSync(path.join(__dirname, "../src/lib/card-due-attention.ts"), "utf8");
const output = ts.transpileModule(input, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const sandbox = { exports: {}, Date, Number, Math, Map, Set, Array };
vm.runInNewContext(output, sandbox);
const { customerCardDueAttention } = sandbox.exports;

const customer = (id, name = id) => ({ id, fullName: name, mobile: null });
function due(id, idCustomer, paid, recovered, commission, timestamp = "2026-11-04T09:00:00Z") {
  return {
    id, transaction: { customer: customer(idCustomer), transactionAt: timestamp },
    dueAmount: paid, commissionRemaining: commission,
    recoveries: [{ swipeAmount: recovered }],
    manualLedgerAllocations: [],
  };
}
const payout = (id, paidBack, status = "COMPLETED") => ({
  customer: { id }, status: "PENDING", sourceTransaction: { status: "COMPLETED" },
  payments: [{ amount: paidBack, status }], manualLedgerAllocations: [],
});

test("preserves commission-only customers in Needs attention", () => {
  const rows = [due("old", "a", 10000, 10000, 871.59)];
  const [attention] = customerCardDueAttention(rows, []);
  assert.equal(attention.principalToReceive, 0);
  assert.equal(attention.commissionToCollect, 871.59);
  assert.equal(attention.totalToCollect, 871.59);
});

test("groups cases by customer, totals money in paise, and selects the newest case", () => {
  const rows = [
    due("old", "a", "10000.00", "3000.00", "100.11", "2026-11-01T00:00:00Z"),
    due("new", "a", "20000.00", "12000.00", "150.22", "2026-11-03T00:00:00Z"),
    due("other", "b", "1000.00", "1000.00", "0.00"),
  ];
  rows[0].manualLedgerAllocations.push({ targetType: "CARD_DUE", amount: "1000.00" });
  rows[0].manualLedgerAllocations.push({ targetType: "CARD_DUE_COMMISSION", amount: "75.00" });
  const [attention] = customerCardDueAttention(rows, []);
  assert.equal(attention.latest.id, "new");
  assert.equal(attention.principalToReceive, 14000);
  assert.equal(attention.commissionToCollect, 250.33);
  assert.equal(attention.totalToCollect, 14250.33);
});

test("shows customer refunds separately; never nets them silently against commission", () => {
  const rows = [due("a", "a", 10000, 10200, 20.55)];
  const first = customerCardDueAttention(rows, []);
  assert.equal(first[0].principalToReturn, 200);
  assert.equal(first[0].commissionToCollect, 20.55);
  assert.equal(first[0].totalToCollect, 20.55);
  const afterPayout = customerCardDueAttention(rows, [payout("a", 200)]);
  assert.equal(afterPayout[0].principalToReturn, 0);
  assert.equal(afterPayout[0].commissionToCollect, 20.55);
});

test("ignores reversed refunds, payments, and source transactions", () => {
  const rows = [due("a", "a", 10000, 10200, 0)];
  const reversed = payout("a", 200, "REVERSED");
  const result = customerCardDueAttention(rows, [reversed]);
  assert.equal(result[0].principalToReturn, 200);
  const reversedSource = payout("a", 200);
  reversedSource.sourceTransaction.status = "REVERSED";
  assert.equal(customerCardDueAttention(rows, [reversedSource])[0].principalToReturn, 200);
});

test("omits customers with all principal and commission fully settled", () => {
  assert.equal(customerCardDueAttention([due("a", "a", 10000, 10000, 0)], []).length, 0);
});
