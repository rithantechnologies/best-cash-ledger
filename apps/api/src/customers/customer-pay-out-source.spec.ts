import { describe, expect, it, vi } from 'vitest';
import { CustomersService } from './customers.service.js';

describe('Pay Out source suggestions from Pay In', () => {
  it('returns only completed Pay In sources in newest-first order with card and transaction provenance', async () => {
    const account = { accountName: 'Example Wallet', accountType: 'PROVIDER_WALLET' };
    const row = (id: string, direction: string, status: string, when: string, card: string | null) => ({
      id,
      direction,
      financialAccountId: 'wallet-id',
      financialAccount: account,
      customerCardId: card,
      createdAt: new Date(when),
      transactionId: id,
      transaction: {
        transactionNumber: id.toUpperCase(),
        transactionAt: new Date(when),
        status,
      },
      allocations: [],
    });
    const entries = [
      row('old', 'PAY_IN', 'COMPLETED', '2026-10-11T10:00:00.000Z', null),
      row('reversed', 'PAY_IN', 'REVERSED', '2026-10-15T10:00:00.000Z', null),
      row('out', 'PAY_OUT', 'COMPLETED', '2026-10-14T10:00:00.000Z', null),
      row('latest', 'PAY_IN', 'COMPLETED', '2026-10-13T10:00:00.000Z', 'card-1'),
    ];
    const prisma = {
      customer: { findUnique: vi.fn().mockResolvedValue({id:'customer-1',fullName:'Test Customer',mobile:'9999999999',cards:[]}) },
      cardSwipeDetail: { findMany: vi.fn().mockResolvedValue([]) },
      cardDueClearingDetail: { findMany: vi.fn().mockResolvedValue([]) },
      customerLedgerEntryDetail: { findMany: vi.fn().mockResolvedValue(entries) },
    };
    const service = new CustomersService(prisma as never,null as never,null as never,null as never,null as never);
    const result = await service.getCardLedger('customer-1');
    expect(result.payInSources.map((item) => item.transactionId)).toEqual(['latest','old']);
    expect(result.payInSources[0]).toMatchObject({
      financialAccountId: 'wallet-id',
      customerCardId: 'card-1',
      transactionAt: '2026-10-13T10:00:00.000Z',
      accountName: 'Example Wallet',
    });
  });
});
