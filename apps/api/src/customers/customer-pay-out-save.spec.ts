import { BadRequestException } from '@nestjs/common';
import { AccountType, EntryType, RoleName, TransactionStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { CustomersService } from './customers.service.js';

function setup() {
  const amount = 39080;
  const ids = ['payable-1', 'payable-2', 'payable-3'];
  const payables = new Map(ids.map(id => [id, {
    id, customerId: 'customer-1', remainingAmount: amount,
    paidAmount: 0, dueAt: new Date('2026-10-25T00:00:00Z'),
    sourceTransaction: {
      transactionNumber: id.toUpperCase(), status: TransactionStatus.COMPLETED,
      cardSwipe: { customerCardId: 'card-1', customerCard: { bankName: 'HDFC', lastFourDigits: '3291' } },
      cardDueRecovery: null,
    },
  }]));
  const wallet = {
    id: 'wallet-1', accountName: 'PaySwitch Wallet',
    accountType: AccountType.PROVIDER_WALLET, providerId: 'provider-1',
    ledgerAccount: { id: 'ledger-wallet' },
  };
  const tx: any = {
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    cardSwipeDetail: { findMany: vi.fn().mockResolvedValue(
      ids.map(id => ({
        customerPayableAmount: amount,
        transaction: { payable: { payments: [] } },
      })),
    ) },
    cardDueClearingDetail: { findMany: vi.fn().mockResolvedValue([]) },
    customerLedgerEntryDetail: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(async ({data}: any) => ({ id: 'ledger-detail-1', ...data })),
    },
    customerPayable: {
      findUnique: vi.fn(async ({where}: any) => payables.get(where.id)),
      update: vi.fn(async ({where, data}: any) => ({ ...payables.get(where.id), ...data })),
    },
    customerLedgerAllocation: { createMany: vi.fn().mockResolvedValue({ count: 3 }) },
    ledgerAccount: { findMany: vi.fn().mockResolvedValue([
      { ledgerCode: 'SYS-CUST-RECEIVABLE', id: 'receivable-ledger' },
      { ledgerCode: 'SYS-CUST-PAYABLE', id: 'payable-ledger' },
      { ledgerCode: 'SYS-PROVIDER-CHARGE', id: 'fee-ledger' },
    ]) },
    transaction: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({data}: any) => ({
        id: 'new-payout-tx', transactionNumber: data.transactionNumber,
        referenceNumber: data.referenceNumber, ...data,
      })),
    },
    auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
  };
  const prisma: any = { $transaction: vi.fn(async (handler: any) => handler(tx)) };
  const validation: any = {
    activeCustomer: vi.fn().mockResolvedValue({isActive:true}),
    lockAccount: vi.fn(),
    liquidAsset: vi.fn().mockResolvedValue(wallet),
    ensureSufficientFunds: vi.fn(),
  };
  const ledger: any = {post: vi.fn().mockResolvedValue({id:'journal-1'})};
  const idempotency: any = {key: vi.fn().mockResolvedValue('CLIENT:owner-1:stable-key')};
  const payoutCharges: any = {resolve: vi.fn().mockResolvedValue(null)};
  const service = new CustomersService(prisma, ledger, validation, idempotency, payoutCharges);
  const request: any = {
    direction: 'PAY_OUT', amount: 117240, financialAccountId: 'wallet-1',
    transactionAt: '2026-10-19T11:00:00.000Z',
    payoutDestinationType: 'OTHER', payoutDestinationDetails: 'Customer UPI verified',
    allocations: ids.map(targetId => ({targetType:'PAYABLE',targetId,amount})),
  };
  return { service, request, tx, validation, ledger, idempotency };
}

describe('Customer Pay Out saving three matched swipes', () => {
  it('posts three ₹39,080 payable allocations as a single balanced ₹1,17,240 payout', async () => {
    const {service,request,tx,validation,ledger,idempotency}=setup();
    const result = await service.createCardLedgerEntry('customer-1',request,'owner-1',RoleName.OWNER,'stable-key');
    expect(result.startingBalance).toBe(117240);
    expect(result.endingBalance).toBe(0);
    expect(result.matchedAmount).toBe(117240);
    expect(result.unallocatedAmount).toBe(0);
    expect(result.allocations).toHaveLength(3);
    expect(tx.customerPayable.update).toHaveBeenCalledTimes(3);
    expect(tx.customerLedgerAllocation.createMany).toHaveBeenCalledTimes(1);
    expect(validation.ensureSufficientFunds).toHaveBeenCalledWith(tx,expect.objectContaining({id:'wallet-1'}),117240);
    const journal = ledger.post.mock.calls[0][4];
    expect(journal).toEqual(expect.arrayContaining([
      expect.objectContaining({ledgerAccountId:'ledger-wallet', entryType:EntryType.CREDIT, amount:117240}),
      expect.objectContaining({ledgerAccountId:'payable-ledger', entryType:EntryType.DEBIT, amount:117240}),
    ]));
    expect(idempotency.key).toHaveBeenCalledWith(expect.anything(),'owner-1',expect.anything(),'stable-key');
  });

  it('rejects an unfunded source before creating any financial record', async () => {
    const {service,request,tx,validation}=setup();
    validation.ensureSufficientFunds.mockRejectedValue(new BadRequestException('PaySwitch Wallet insufficient balance'));
    await expect(service.createCardLedgerEntry('customer-1',request,'owner-1',RoleName.OWNER,'stable-key'))
      .rejects.toThrow('insufficient balance');
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it('blocks a second payout using an existing wallet transfer reference, before changing payables', async () => {
    const {service,request,tx}=setup();
    request.referenceNumber='629314204378';
    tx.transaction.findFirst.mockResolvedValue({ transactionNumber:'CLK-ORIGINAL' });
    await expect(service.createCardLedgerEntry('customer-1',request,'owner-1',RoleName.OWNER,'different-key'))
      .rejects.toThrow('already recorded under CLK-ORIGINAL');
    expect(tx.transaction.findFirst).toHaveBeenCalledWith({
      where: {
        transactionType:'CUSTOMER_LEDGER_ENTRY',
        status:TransactionStatus.COMPLETED,
        referenceNumber:{equals:'629314204378',mode:'insensitive'},
        customerLedgerEntry:{direction:'PAY_OUT',financialAccountId:'wallet-1'},
      },
      select:{transactionNumber:true},
    });
    expect(tx.customerPayable.update).not.toHaveBeenCalled();
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it('allows a new payout with an unused reference and allocates all matched swipes only once', async () => {
    const {service,request,tx}=setup();
    request.referenceNumber='new-bank-utr';
    const result=await service.createCardLedgerEntry('customer-1',request,'owner-1',RoleName.OWNER,'unused-key');
    expect(tx.transaction.findFirst).toHaveBeenCalledOnce();
    expect(tx.transaction.create).toHaveBeenCalledOnce();
    expect(result.matchedAmount).toBe(117240);
  });
});
