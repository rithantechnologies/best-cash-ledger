import { describe, expect, it, vi } from 'vitest';
import { CardSwipeReportService } from './card-swipe-report.service.js';

const card = {
  bankName: 'KOTAK', cardType: 'CREDIT', lastFourDigits: '5492', cardNetwork: { name: 'VISA' },
};
const row = {
  id: 'swipe-1', transactionNumber: 'CCS-001', transactionAt: new Date('2026-10-27T04:30:00Z'),
  customer: { fullName: 'Demo Customer', mobile: '9000000000' },
  cardSwipe: {
    customerCard: card, swipeAmount: '22900', commissionAmount: '527',
    providerChargeAmount: '366', customerPayableAmount: '22373',
    settlementAccount: { accountName: 'ROINET' },
  },
  payable: {
    status: 'PARTIALLY_PAID', remainingAmount: '17373',
    payments: [{
      status: 'COMPLETED', sourceAccount: { accountName: 'PAYSWITCH' },
      transaction: { status: 'COMPLETED', charges: [{ amount: '12' }] },
    }],
    manualLedgerAllocations: [{
      amount: '1000', customerLedgerEntry: {
        amount: '2000', financialAccount: { accountName: 'INDUS SARA' },
        transaction: { status: 'COMPLETED', charges: [{ amount: '20' }] },
      },
    }],
    advanceOffsets: [],
  },
  providerSettlementSource: { provider: { name: 'ROINET' }, gateway: { gatewayName: 'Gateway' } },
};

describe('credit card swipe report', () => {
  it('uses India business dates, masked card details and real payout fee allocation', async () => {
    const findMany = vi.fn().mockResolvedValue([row]);
    const service = new CardSwipeReportService({ transaction: { findMany } } as never);
    const result = await service.get('2026-10-27', '2026-10-27');
    expect(findMany.mock.calls[0][0].where.transactionAt).toEqual({
      gte: new Date('2026-10-26T18:30:00.000Z'), lt: new Date('2026-10-27T18:30:00.000Z'),
    });
    expect(result.count).toBe(1);
    expect(result.rows[0].cardLastFour).toBe('5492');
    expect(result.rows[0].payoutSources).toEqual(['PAYSWITCH', 'INDUS SARA']);
    expect(result.summary).toMatchObject({
      swipeAmount: 22900, customerFee: 527, gatewayFee: 366, payoutFee: 22,
      netProfit: 139, payableAmount: 22373, paidAmount: 5000, remainingAmount: 17373,
    });
  });
  it('rejects an invalid or reversed date range', async () => {
    const service = new CardSwipeReportService({ transaction: { findMany: vi.fn() } } as never);
    await expect(service.get('2026-10-29','2026-10-27')).rejects.toThrow();
  });
  it('rejects a truncated report instead of showing incorrect totals', async () => {
    const service = new CardSwipeReportService({ transaction: { findMany: vi.fn().mockResolvedValue(Array(10_001).fill(row)) } } as never);
    await expect(service.get('2026-10-27','2026-10-27')).rejects.toThrow('10,000');
  });
});
