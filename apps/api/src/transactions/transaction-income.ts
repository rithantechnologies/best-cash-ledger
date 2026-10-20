/** Read-only transaction earning breakdown. Amounts are accumulated as paise to
 * avoid display rounding drift. Transfer principal is NEVER counted as income.
 */
type Amount = number | string | { toString(): string } | null | undefined;
type Charge = { amount: Amount; chargeType: string };
type Commission = { amount: Amount; commissionType: string };
export type IncomeTransaction = {
  id: string; transactionNumber: string; transactionType: string;
  transactionAt: Date | string; grossAmount: Amount; customer?: { fullName: string } | null;
  charges: Charge[]; commissions: Commission[];
  quickCashTransfer?: {
    direction: string; purpose: string; cashOutType: string | null;
    serviceName: string | null; beneficiaryMode: string | null;
    servicePartnerCharge: Amount;
  } | null;
};
export type IncomeAmounts = {
  customerCommission: number; providerIncome: number; serviceRevenue: number;
  totalIncome: number; providerCost: number; payoutCost: number; partnerCost: number; netIncome: number;
};
export type IncomeDetail = {
  id: string; transactionNumber: string; transactionAt: string; customer: string | null;
  category: string; amounts: IncomeAmounts; attribution?: string;
};
const cents = (value: Amount) => Math.round(Number(value ?? 0) * 100);
const name = (value: string | null | undefined) => value?.trim() || null;
const money = (value: number) => Math.round(value) / 100;
export const emptyIncome = (): IncomeAmounts => ({
  customerCommission: 0, providerIncome: 0, serviceRevenue: 0, totalIncome: 0,
  providerCost: 0, payoutCost: 0, partnerCost: 0, netIncome: 0,
});
export function categoryForIncome(tx: IncomeTransaction): string {
  const quick = tx.quickCashTransfer;
  if (tx.transactionType === 'CARD_SWIPE') return 'Card Swipe';
  if (tx.transactionType === 'CUSTOMER_PAYOUT' || tx.transactionType === 'CUSTOMER_LEDGER_ENTRY') return 'Customer Pay Out / Pay In';
  if (tx.transactionType.startsWith('CARD_DUE')) return 'Card Due';
  if (tx.transactionType === 'SERVICE_INCOME') return 'Service · ' + (name(quick?.serviceName) ?? 'Other');
  if (quick && quick.purpose === 'TRANSFER') {
    if (quick.direction === 'IN') return name(quick.serviceName) ??
      (quick.beneficiaryMode === 'BANK' ? 'Bank Transfer' :
       quick.beneficiaryMode === 'UPI' ? 'GPay / UPI Transfer' : 'Cash In · Transfer');
    if (quick.cashOutType === 'AEPS') return 'AEPS Withdrawal';
    if (quick.cashOutType === 'MICRO_ATM') return 'Micro ATM';
    return 'UPI / QR Cash Out';
  }
  if (tx.transactionNumber.startsWith('QCM-')) return 'AEPS Withdrawal';
  if (tx.transactionType === 'AEPS_WITHDRAWAL') return 'AEPS Withdrawal';
  if (tx.transactionType === 'MICRO_ATM') return 'Micro ATM';
  if (tx.transactionType === 'CASH_TRANSFER') return 'Bank / Cash Transfer';
  if (tx.transactionType === 'INTERNAL_TRANSFER') return 'Internal Transfer';
  if (tx.transactionType.includes('EXPENSE')) return 'Expenses & Charges';
  return tx.transactionType.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
export function transactionIncome(tx: IncomeTransaction): IncomeDetail {
  let customerCommission = 0, providerIncome = 0, providerCost = 0, payoutCost = 0, partnerCharge = 0;
  for (const commission of tx.commissions) {
    if (commission.commissionType.endsWith('_PROVIDER')) providerIncome += cents(commission.amount);
    else customerCommission += cents(commission.amount);
  }
  for (const charge of tx.charges) {
    const cost = cents(charge.amount);
    if (charge.chargeType === 'SERVICE_PARTNER_COST') partnerCharge += cost;
    else if (charge.chargeType === 'PAYOUT') payoutCost += cost;
    else providerCost += cost;
  }
  const serviceRevenue = tx.transactionType === 'SERVICE_INCOME' ? cents(tx.grossAmount) : 0;
  // Outsourced costs are also stored as transaction charges. Include once.
  const partnerCost = Math.max(partnerCharge,
    tx.transactionType === 'SERVICE_INCOME' ? cents(tx.quickCashTransfer?.servicePartnerCharge) : 0);
  const totalIncome = customerCommission + providerIncome + serviceRevenue;
  return {
    id: tx.id, transactionNumber: tx.transactionNumber,
    transactionAt: new Date(tx.transactionAt).toISOString(),
    customer: tx.customer?.fullName ?? null,
    category: categoryForIncome(tx),
    amounts: {
      customerCommission: money(customerCommission), providerIncome: money(providerIncome),
      serviceRevenue: money(serviceRevenue), totalIncome: money(totalIncome),
      providerCost: money(providerCost), payoutCost: money(payoutCost),
      partnerCost: money(partnerCost),
      netIncome: money(totalIncome - providerCost - payoutCost - partnerCost),
    },
  };
}


/** Allocate one recorded payout fee across its actual linked source swipes in
 * whole paise, with the remainder staying on the other payout category.
 * Never add a fee back to its parent transaction: that would double count.
 */
export function attributePayoutIncome(
  detail: IncomeDetail,
  payoutAmount: Amount,
  targets: readonly { transactionType: string; transactionNumber: string; amount: Amount }[],
): IncomeDetail[] {
  const totalFee = cents(detail.amounts.payoutCost);
  const totalPayout = cents(payoutAmount);
  if (totalFee <= 0 || totalPayout <= 0 || !targets.length) return [detail];
  const result: IncomeDetail[] = [];
  let used = 0;
  let allocatedBase = 0;
  for (const target of targets) {
    const amount = Math.max(0, cents(target.amount));
    if (!amount || allocatedBase >= totalPayout) continue;
    const share = Math.min(amount, totalPayout - allocatedBase);
    allocatedBase += share;
    const cost = Math.min(totalFee - used, Math.floor(totalFee * share / totalPayout));
    if (!cost) continue;
    used += cost;
    const kind = target.transactionType === 'CARD_SWIPE' ? 'Card Swipe'
      : target.transactionType.startsWith('CARD_DUE') ? 'Card Due' : detail.category;
    result.push({
      ...detail, category: kind,
      attribution: 'Payout fee linked to ' + target.transactionNumber,
      amounts: { ...emptyIncome(), payoutCost: money(cost), netIncome: money(-cost) },
    });
  }
  const remainder = totalFee - used;
  if (remainder > 0 || detail.amounts.totalIncome || detail.amounts.providerCost || detail.amounts.partnerCost) {
    result.push({
      ...detail,
      amounts: { ...detail.amounts, payoutCost: money(remainder),
        netIncome: money(cents(detail.amounts.netIncome) + used) },
    });
  }
  return result;
}
