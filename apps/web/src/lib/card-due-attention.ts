/**
 * Customer-wide Card Due follow-up balances.
 *
 * Principal is a net customer balance: money advanced + excess returned - principal
 * recovered. Assessed commission is kept separate and is never silently netted
 * against a refund owed to the customer.
 *
 * All calculations use integer paise to avoid float drift between cases.
 */
type Amount = string | number;
type FollowUpCustomer = { id: string; fullName: string; mobile: string | null };
export type CardDueFollowUpCase = {
  transaction: { customer: FollowUpCustomer | null; transactionAt: string };
  dueAmount: Amount;
  commissionRemaining: Amount;
  recoveries: { swipeAmount: Amount }[];
  manualLedgerAllocations: { targetType: string; amount: Amount }[];
};
export type CardDueFollowUpPayable = {
  customer: { id: string };
  status: string;
  sourceTransaction: { status: string };
  payments: { amount: Amount; status: string }[];
  manualLedgerAllocations: { amount: Amount }[];
};
export type CardDueCustomerAttention<T extends CardDueFollowUpCase> = {
  id: string;
  name: string;
  mobile: string;
  principalBalance: number;
  principalToReceive: number;
  principalToReturn: number;
  commissionToCollect: number;
  totalToCollect: number;
  latest: T;
};

const paise = (v: Amount) => Math.round(Number(v || 0) * 100);
const rupees = (v: number) => v / 100;
const inactive = new Set(["CANCELLED", "REVERSED", "FAILED"]);

export function customerCardDueAttention<T extends CardDueFollowUpCase>(
  cases: readonly T[],
  payables: readonly CardDueFollowUpPayable[],
): CardDueCustomerAttention<T>[] {
  const byCustomer = new Map<string, {
    customer: FollowUpCustomer;
    latest: T;
    principalPaise: number;
    commissionPaise: number;
  }>();

  for (const row of cases) {
    const customer = row.transaction.customer;
    if (!customer) continue;
    let item = byCustomer.get(customer.id);
    if (!item) {
      item = { customer, latest: row, principalPaise: 0, commissionPaise: 0 };
      byCustomer.set(customer.id, item);
    }
    if (new Date(row.transaction.transactionAt).getTime() >
        new Date(item.latest.transaction.transactionAt).getTime()) {
      item.latest = row;
    }
    item.principalPaise += paise(row.dueAmount);
    for (const recovery of row.recoveries) {
      item.principalPaise -= paise(recovery.swipeAmount);
    }
    for (const allocation of row.manualLedgerAllocations) {
      if (allocation.targetType === "CARD_DUE") {
        item.principalPaise -= paise(allocation.amount);
      }
    }
    item.commissionPaise += paise(row.commissionRemaining);
  }

  for (const payable of payables) {
    // A reversed payable, refund or payment must not reappear in the balance.
    if (inactive.has(payable.status) || inactive.has(payable.sourceTransaction.status)) continue;
    const item = byCustomer.get(payable.customer.id);
    if (!item) continue;
    for (const payment of payable.payments) {
      if (payment.status === "COMPLETED") item.principalPaise += paise(payment.amount);
    }
    for (const allocation of payable.manualLedgerAllocations) {
      item.principalPaise += paise(allocation.amount);
    }
  }

  return Array.from(byCustomer.entries()).map(([id, item]) => {
    const principalToReceive = Math.max(item.principalPaise, 0);
    const principalToReturn = Math.max(-item.principalPaise, 0);
    const commissionToCollect = Math.max(item.commissionPaise, 0);
    return {
      id,
      name: item.customer.fullName,
      mobile: item.customer.mobile || "",
      principalBalance: rupees(item.principalPaise),
      principalToReceive: rupees(principalToReceive),
      principalToReturn: rupees(principalToReturn),
      commissionToCollect: rupees(commissionToCollect),
      totalToCollect: rupees(principalToReceive + commissionToCollect),
      latest: item.latest,
    };
  })
    .filter(item => item.totalToCollect > 0.001 || item.principalToReturn > 0.001)
    .sort((a, b) =>
      Math.max(b.totalToCollect, b.principalToReturn) -
      Math.max(a.totalToCollect, a.principalToReturn));
}
