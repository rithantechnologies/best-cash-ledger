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
  it('includes prior real customer payout funding accounts, never infers source from the swipe settlement', async () => {
    const when = new Date('2026-10-17T08:00:00.000Z');
    const sourceAccount = { id: 'payswitch-1', accountName: 'PaySwitch Wallet', accountType: 'PROVIDER_WALLET' };
    const payment = {
      id: 'pay-1', amount: 4000,
      sourceAccountId: sourceAccount.id, sourceAccount, paymentDate: when,
      transactionId: 'payout-tx-1',
      transaction: { transactionNumber: 'PAYOUT-1' },
      destinationLabel: 'Customer bank', destinationReference: null, referenceNumber: null,
    };
    const swipe = {
      id: 'swipe-1', providerId: 'provider-1', gatewayId: 'gateway-1',
      customerCardId: 'card-1',
      customerCard: { bankName: 'Example Bank', lastFourDigits: '1234' },
      swipeAmount: 4100, commissionAmount: 100, customerPayableAmount: 4000,
      transaction: {
        id: 'swipe-tx-1', transactionNumber: 'SWIPE-1',
        transactionAt: new Date('2026-10-16T08:00:00.000Z'),
        referenceNumber: null,
        payable: {
          id: 'payable-1', remainingAmount: 0, originalAmount: 4000,
          dueAt: when, payments: [payment],
        },
      },
    };
    const manual = (id: string, direction: string, status: string, accountName: string) => ({
      id, direction, amount: 50, receivableAmount: 50, advanceAppliedAmount: 0,
      financialAccountId: 'account-' + id,
      financialAccount: { accountName, accountType: 'BANK' },
      customerCardId: null, customerCard: null, remarks: 'test',
      transactionId: 'tx-' + id, createdAt: when,
      transaction: { transactionNumber: 'TX-' + id, transactionAt: when, status, referenceNumber: null },
      allocations: [], payoutDestination: null,
    });
    const prisma = {
      customer: { findUnique: vi.fn().mockResolvedValue({
        id:'customer-1',fullName:'Test Customer',mobile:'9999999999',cards:[],
      }) },
      cardSwipeDetail: { findMany: vi.fn().mockResolvedValue([swipe]) },
      cardDueClearingDetail: { findMany: vi.fn().mockResolvedValue([]) },
      customerLedgerEntryDetail: { findMany: vi.fn().mockResolvedValue([
        manual('old-out','PAY_OUT','COMPLETED','Example Bank'),
        manual('reversed','PAY_OUT','REVERSED','Not available'),
      ]) },
      provider: { findMany: vi.fn().mockResolvedValue([]) },
      providerGateway: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new CustomersService(prisma as never,null as never,null as never,null as never,null as never);
    const result = await service.getCardLedger('customer-1');
    expect(result.payInSources).toHaveLength(0);
    expect(result.swipeSummary).toEqual({
      grossSwipe: 4100, customerCharges: 100,
      netSwipePayable: 4000, swipeCount: 1,
    });
    expect(result.payOutSources.map(item => item.transactionId)).toContain('payout-tx-1');
    expect(result.payOutSources.map(item => item.transactionId)).toContain('tx-old-out');
    expect(result.payOutSources.map(item => item.transactionId)).not.toContain('swipe-tx-1');
    expect(result.payOutSources.map(item => item.transactionId)).not.toContain('tx-reversed');
    expect(result.payOutSources.find(item => item.transactionId === 'payout-tx-1'))
      .toMatchObject({
        sourceKind: 'CUSTOMER_PAYOUT',
        financialAccountId: 'payswitch-1',
        customerCardId: 'card-1',
        accountName: 'PaySwitch Wallet',
        transactionNumber: 'PAYOUT-1',
      });
  });

});
