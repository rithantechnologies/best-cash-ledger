export type DuePayableInput = {
  id: string;
  originalAmount: unknown;
  paidAmount: unknown;
  offsetAmount: unknown;
  remainingAmount: unknown;
  dueAt: Date;
  status: string;
  customer: { id: string; fullName: string; mobile: string | null };
  paymentTerm: { name: string; durationValue: number; durationUnit: string } | null;
  sourceTransaction: {
    transactionNumber: string;
    transactionType: string;
    transactionAt: Date;
    cardSwipe: {
      swipeAmount: unknown;
      commissionAmount: unknown;
      commissionRate: unknown;
      providerChargeAmount: unknown;
      providerId?: string;
      gatewayId?: string;
      customerCard: { bankName: string; lastFourDigits: string };
    } | null;
  };
};

const money = (n: unknown) => Math.round((Number(n ?? 0) + Number.EPSILON) * 100) / 100;
const day = (value: Date) => new Date(value.getTime() + 330 * 60_000).toISOString().slice(0, 10);

export function buildDueReport(
  items: DuePayableInput[], now = new Date(),
  sourceNames: { providers: Map<string,string>; gateways: Map<string,string> } = {
    providers: new Map(), gateways: new Map(),
  },
) {
  const today = day(now);
  const dates = new Map<string, {
    date: string; itemCount: number; customerCount: number; cardCount: number;
    grossSwipe: number; customerCharges: number; netPayable: number;
    paid: number; advance: number; remaining: number; status: 'OVERDUE'|'TODAY'|'UPCOMING';
    customers: Set<string>; cards: Set<string>;
  }>();
  const rows = items.filter(p => money(p.remainingAmount) > 0 && !['CANCELLED','REVERSED','PAID'].includes(p.status))
    .map(p => {
      const swipe = p.sourceTransaction.cardSwipe;
      const dueDate = day(p.dueAt);
      const outstanding = money(p.remainingAmount);
      const cardLabel = swipe ? swipe.customerCard.bankName + ' ••••' + swipe.customerCard.lastFourDigits : '—';
      const row = {
        id: p.id,
        dueDate,
        dueAt: p.dueAt.toISOString(),
        swipeDate: day(p.sourceTransaction.transactionAt),
        transactionAt: p.sourceTransaction.transactionAt.toISOString(),
        customerId: p.customer.id,
        customer: p.customer.fullName,
        mobile: p.customer.mobile ?? '',
        card: cardLabel,
        provider: swipe ? sourceNames.providers.get(swipe.providerId ?? '') ?? '' : '',
        gateway: swipe ? sourceNames.gateways.get(swipe.gatewayId ?? '') ?? '' : '',
        transactionNumber: p.sourceTransaction.transactionNumber,
        service: p.sourceTransaction.transactionType,
        term: p.paymentTerm?.name ?? 'Custom',
        termDays: p.paymentTerm
          ? p.paymentTerm.durationUnit === 'DAYS' ? p.paymentTerm.durationValue
            : p.paymentTerm.durationUnit === 'HOURS' ? p.paymentTerm.durationValue / 24 : null
          : null,
        grossSwipe: swipe ? money(swipe.swipeAmount) : 0,
        customerCharges: swipe ? money(swipe.commissionAmount) : 0,
        customerRate: swipe ? Number(swipe.commissionRate) : null,
        gatewayCharge: swipe ? money(swipe.providerChargeAmount) : 0,
        netPayable: money(p.originalAmount),
        paid: money(p.paidAmount),
        advance: money(p.offsetAmount),
        remaining: outstanding,
        status: dueDate < today ? 'OVERDUE' : dueDate === today ? 'DUE TODAY' : 'UPCOMING',
      };
      if (!dates.has(dueDate)) {
        dates.set(dueDate, {
          date: dueDate, itemCount: 0, customerCount: 0, cardCount: 0,
          grossSwipe: 0, customerCharges: 0, netPayable: 0,
          paid: 0, advance: 0, remaining: 0,
          status: dueDate < today ? 'OVERDUE' : dueDate === today ? 'TODAY' : 'UPCOMING',
          customers: new Set(), cards: new Set(),
        });
      }
      const summary = dates.get(dueDate)!;
      summary.itemCount += 1;
      summary.customers.add(row.customerId);
      summary.cards.add(row.customerId + ':' + row.card);
      summary.grossSwipe = money(summary.grossSwipe + row.grossSwipe);
      summary.customerCharges = money(summary.customerCharges + row.customerCharges);
      summary.netPayable = money(summary.netPayable + row.netPayable);
      summary.paid = money(summary.paid + row.paid);
      summary.advance = money(summary.advance + row.advance);
      summary.remaining = money(summary.remaining + row.remaining);
      return row;
    })
    .sort((a,b) => a.dueDate.localeCompare(b.dueDate) || a.customer.localeCompare(b.customer) || a.card.localeCompare(b.card));
  const dateRows = [...dates.values()].sort((a,b) => a.date.localeCompare(b.date)).map(group => ({
    date: group.date,
    itemCount: group.itemCount,
    customerCount: group.customers.size,
    cardCount: group.cards.size,
    grossSwipe: group.grossSwipe,
    customerCharges: group.customerCharges,
    netPayable: group.netPayable,
    paid: group.paid,
    advance: group.advance,
    remaining: group.remaining,
    status: group.status,
  }));
  const cards = new Map<string, {
    customer: string; mobile: string; card: string; earliestDue: string;
    swipeCount: number; grossSwipe: number; customerCharges: number;
    netPayable: number; paid: number; advance: number; remaining: number;
  }>();
  for (const row of rows) {
    const key = row.customerId + ':' + row.card;
    if (!cards.has(key)) cards.set(key, {
      customer: row.customer, mobile: row.mobile, card: row.card,
      earliestDue: row.dueDate, swipeCount: 0, grossSwipe: 0, customerCharges: 0,
      netPayable: 0, paid: 0, advance: 0, remaining: 0,
    });
    const c = cards.get(key)!;
    c.swipeCount += 1;
    c.grossSwipe = money(c.grossSwipe + row.grossSwipe);
    c.customerCharges = money(c.customerCharges + row.customerCharges);
    c.netPayable = money(c.netPayable + row.netPayable);
    c.paid = money(c.paid + row.paid);
    c.advance = money(c.advance + row.advance);
    c.remaining = money(c.remaining + row.remaining);
    if (row.dueDate < c.earliestDue) c.earliestDue = row.dueDate;
  }
  const totals = {
    outstanding: money(rows.reduce((s,r)=>s+r.remaining,0)),
    overdue: money(rows.filter(r=>r.dueDate<today).reduce((s,r)=>s+r.remaining,0)),
    today: money(rows.filter(r=>r.dueDate===today).reduce((s,r)=>s+r.remaining,0)),
    upcoming: money(rows.filter(r=>r.dueDate>today).reduce((s,r)=>s+r.remaining,0)),
    itemCount: rows.length,
    customerCount: new Set(rows.map(r=>r.customerId)).size,
  };
  return {
    generatedAt: now.toISOString(), businessDate: today,
    totals, dates: dateRows, rows,
    cards: [...cards.values()].sort((a,b)=>a.earliestDue.localeCompare(b.earliestDue) || a.customer.localeCompare(b.customer)),
  };
}
