import { describe, expect, it, vi } from 'vitest';
import { Prisma, ReceivableStatus, TransactionStatus } from '@prisma/client';
import { ReceivablesService } from './receivables.service.js';

const dec = (value: number) => new Prisma.Decimal(value);
function fixture(commission = 1196.82, collected = 0) {
  const prisma = {
    cardDueClearingDetail: {
      findMany: vi.fn().mockResolvedValue([{
        id: 'case-1', transactionId: 'card-1',
        dueAmount: dec(39894), principalRecovered: dec(35000), principalRemaining: dec(4894),
        commissionAmount: dec(commission), commissionCollected: dec(collected),
        commissionRemaining: dec(commission - collected), nextFollowUpAt: null,
        customerCard: { bankName: 'State Bank', lastFourDigits: '8722' },
        advanceSourceAccount: { accountName: 'EASYPAY Wallet' },
        transaction: {
          id: 'card-1', transactionNumber: 'CDC-1', transactionAt: new Date('2026-10-22'),
          status: TransactionStatus.PARTIALLY_PAID,
          customer: { id: 'customer-1', fullName: 'Sample Customer', mobile: '9000000000' },
        },
      }]),
    },
  };
  const service = new ReceivablesService(prisma as never, {} as never, {} as never, {} as never);
  vi.spyOn(service, 'list').mockResolvedValue([] as any);
  return { service, prisma };
}

describe('unified receivables read projection', () => {
  it('includes ₹4,894 card principal and ₹1,196.82 accrued commission once without creating another receivable', async () => {
    const { service, prisma } = fixture();
    const data = await service.unifiedList();
    expect(data.summary.total.amount).toBe(6090.82);
    expect(data.summary.principal.amount).toBe(4894);
    expect(data.summary.commission.amount).toBe(1196.82);
    expect(data.items).toHaveLength(2);
    expect(data.items.map(i => i.status)).toEqual([ReceivableStatus.PARTIALLY_RECEIVED, ReceivableStatus.PENDING]);
    expect(data.items.map(i => i.cardDueTransactionId)).toEqual(['card-1','card-1']);
    expect(prisma.cardDueClearingDetail.findMany).toHaveBeenCalledTimes(1);
  });
  it('leaves zero-commission legacy cases with only the principal obligation', async () => {
    const { service } = fixture(0);
    const data = await service.unifiedList();
    expect(data.items).toHaveLength(1);
    expect(data.summary.total.amount).toBe(4894);
  });
  it('does not classify a fully collected commission as outstanding', async () => {
    const { service } = fixture(1196.82, 1196.82);
    const data = await service.unifiedList({kind:'CARD_COMMISSION',status:ReceivableStatus.RECEIVED});
    expect(data.items).toHaveLength(1);
    expect(data.items[0].status).toBe(ReceivableStatus.RECEIVED);
    expect(data.summary.commission.amount).toBe(0);
  });
});
