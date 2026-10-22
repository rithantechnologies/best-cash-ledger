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
    customerCard: { findFirst: vi.fn().mockResolvedValue({
      id:'card-1', customerId:'customer-1',isActive:true,
      bankName:'KOTAK VISA',lastFourDigits:'0428',nickname:null,
    }) },

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
    customerCard: vi.fn().mockResolvedValue({id:'card-1',customerId:'customer-1',isActive:true}),
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

  it('saves payout to the same swipe credit card, independently from the funding wallet', async () => {
    const {service,request,tx,ledger}=setup();
    request.customerCardId='card-1';
    request.payoutDestinationType='CARD';
    request.payoutDestinationId='card-1';
    delete request.payoutDestinationDetails;
    await service.createCardLedgerEntry('customer-1',request,'owner-1',RoleName.OWNER,'card-payout');
    expect(tx.customerCard.findFirst).toHaveBeenCalledWith({
      where: {id:'card-1',customerId:'customer-1',isActive:true},
    });
    expect(tx.customerLedgerEntryDetail.create).toHaveBeenCalledWith({
      data:expect.objectContaining({
        financialAccountId:'wallet-1',customerCardId:'card-1',
        payoutDestination:{type:'CARD',destinationId:'card-1',label:'Credit card · KOTAK VISA ••••0428'},
      }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data:expect.objectContaining({newValues:expect.objectContaining({
        payoutDestination:{type:'CARD',destinationId:'card-1',label:'Credit card · KOTAK VISA ••••0428'},
      })}),
    });
    expect(ledger.post).toHaveBeenCalledTimes(1);
  });

  it('requires a paid-to destination on all customer Pay Out API requests',async()=>{
    const {service,request,tx}=setup();
    delete request.payoutDestinationType;
    delete request.payoutDestinationDetails;
    await expect(service.createCardLedgerEntry('customer-1',request,'owner-1',RoleName.OWNER,'no-recipient'))
      .rejects.toThrow('Select where the payout was paid to');
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it('rejects a saved card outside the current customer without posting',async()=>{
    const {service,request,tx}=setup();
    request.payoutDestinationType='CARD';
    request.payoutDestinationId='card-elsewhere';
    tx.customerCard.findFirst.mockResolvedValue(null);
    await expect(service.createCardLedgerEntry('customer-1',request,'owner-1',RoleName.OWNER,'foreign-card'))
      .rejects.toThrow('does not belong');
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it('allows a third-party card with only a holder/bank/last-four description',async()=>{
    const {service,request,tx}=setup();
    request.payoutDestinationType='OTHER_CARD';
    request.payoutDestinationDetails='Friend Arun · HDFC · 5566';
    await service.createCardLedgerEntry('customer-1',request,'owner-1',RoleName.OWNER,'other-card');
    expect(tx.customerLedgerEntryDetail.create).toHaveBeenCalledWith({
      data:expect.objectContaining({payoutDestination:{
        type:'OTHER_CARD',label:'Other credit card · Friend Arun · HDFC · 5566',
      }}),
    });
  });

  it('rejects a full card number in the manual card recipient',async()=>{
    const {service,request,tx}=setup();
    request.payoutDestinationType='OTHER_CARD';
    request.payoutDestinationDetails='Friend Arun HDFC 4312 1234 5678 9012';
    await expect(service.createCardLedgerEntry('customer-1',request,'owner-1',RoleName.OWNER,'full-pan'))
      .rejects.toThrow('last four');
    expect(tx.transaction.create).not.toHaveBeenCalled();
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
