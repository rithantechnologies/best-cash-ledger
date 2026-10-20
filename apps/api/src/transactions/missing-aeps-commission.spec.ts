import { BadRequestException } from '@nestjs/common';
import { AccountType, EntryType, Prisma, RoleName, TransactionStatus, TransactionType } from '@prisma/client';
import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { TransactionsService } from './transactions.service.js';
import { TransactionsController } from './transactions.controller.js';

const money = (n: number) => new Prisma.Decimal(n);

function fixture(options: { existingCommission?: number; existingAdjustment?: boolean; status?: TransactionStatus } = {}) {
  const original = {
    id: 'aeps-tx', transactionNumber: 'QCT-2026-1',
    transactionType: TransactionType.CASH_TRANSFER,
    transactionAt: new Date('2026-10-18T10:00:00.000Z'),
    status: options.status ?? TransactionStatus.PENDING,
    customerId: 'customer-1', commissions: [],
    quickCashTransfer: {
      direction: 'OUT', purpose: 'TRANSFER', cashOutType: 'AEPS',
      cashAccountId: 'cash-1', commissionAmount: money(options.existingCommission ?? 0),
      amount: money(25000),
    },
  };
  const cash = {
    id: 'cash-1', accountType: AccountType.CASH, accountName: 'Drawer A',
    ledgerAccount: {id:'ledger-cash'},
  };
  const bank = {
    id: 'bank-1', accountType: AccountType.BANK, accountName: 'Axis Bank',
    ledgerAccount: {id:'ledger-bank'},
  };
  const created = {
    id: 'new-commission-id', transactionNumber: 'QCM-TEST',
    transactionType: TransactionType.ACCOUNT_ENTRY,
    grossAmount: money(250), netAmount: money(250),
    status: TransactionStatus.COMPLETED, customerId: 'customer-1',
  };
  const tx: any = {
    $queryRawUnsafe: vi.fn().mockResolvedValue([{id:'aeps-tx'}]),
    transaction: {
      findUnique: vi.fn().mockResolvedValue(original),
      findFirst: vi.fn().mockResolvedValue(options.existingAdjustment
        ? {id:'already', transactionNumber:'QCM-EXISTING'} : null),
      create: vi.fn().mockResolvedValue(created),
    },
    ledgerAccount: {
      findUnique: vi.fn().mockResolvedValue({id:'sys-income',ledgerCode:'SYS-COMMISSION'}),
    },
    accountEntryDetail: {create:vi.fn().mockResolvedValue({})},
    transactionCommission: {create:vi.fn().mockResolvedValue({})},
    auditLog: {create:vi.fn().mockResolvedValue({})},
  };
  const prisma: any = {
    $transaction: vi.fn((callback:any)=>callback(tx)),
  };
  const validation: any = {
    lockAccount: vi.fn(),
    cashAccount: vi.fn().mockResolvedValue(cash),
    liquidAsset: vi.fn().mockResolvedValue(bank),
    requireOpenCashDesk: vi.fn(),
  };
  const ledger: any = {post:vi.fn().mockResolvedValue({id:'journal-1'})};
  const service=new TransactionsService(prisma,ledger,validation,{} as any,{} as any,{} as any);
  return {original,tx,prisma,validation,ledger,service,created};
}
const request = {
  amount:250,receivedVia:'CASH' as const,
  reason:'Client missed the AEPS commission during cash out',
};
describe('AEPS Cash Out missing commission - Owner adjustment',()=>{
  it('requires OWNER role at controller level',()=>{
    expect(Reflect.getMetadata('roles',TransactionsController.prototype.addMissingAepsCommission))
      .toEqual([RoleName.OWNER]);
  });
  it('posts a cash commission now, with equal debit and credit, without modifying original payout',async()=>{
    const {service,tx,ledger,validation}=fixture();
    const result=await service.addMissingAepsCommission('aeps-tx',request,'owner-1');
    expect(result.amount).toBe(250);
    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'),'aeps-tx');
    expect(validation.requireOpenCashDesk).toHaveBeenCalledWith(
      tx,'cash-1',expect.stringContaining('commission'));
    expect(tx.transaction.update).toBeUndefined();
    expect(tx.quickCashTransferDetail).toBeUndefined();
    expect(tx.transaction.create).toHaveBeenCalledWith({data:expect.objectContaining({
      correctionSourceTransactionId:'aeps-tx',transactionType:TransactionType.ACCOUNT_ENTRY,
      transactionAt:expect.any(Date),customerId:'customer-1',
    })});
    const entries=ledger.post.mock.calls[0][4];
    expect(entries).toEqual([
      expect.objectContaining({ledgerAccountId:'ledger-cash',entryType:EntryType.DEBIT,amount:250}),
      expect.objectContaining({ledgerAccountId:'sys-income',entryType:EntryType.CREDIT,amount:250}),
    ]);
    expect(tx.transactionCommission.create).toHaveBeenCalledWith({data:expect.objectContaining({
      commissionType:'AEPS_CUSTOMER_LATE',amount:money(250),
    })});
    expect(tx.auditLog.create).toHaveBeenCalledWith({data:expect.objectContaining({
      entityId:'aeps-tx',action:'ADD_MISSING_AEPS_COMMISSION',
    })});
  });
  it('posts confirmed UPI commission to its actual bank/UPI account only',async()=>{
    const {service,tx,ledger,validation}=fixture();
    await service.addMissingAepsCommission('aeps-tx',{
      ...request,receivedVia:'BANK_UPI',accountId:'bank-1',
    },'owner-1');
    expect(validation.requireOpenCashDesk).not.toHaveBeenCalled();
    expect(ledger.post.mock.calls[0][4][0]).toEqual(
      expect.objectContaining({ledgerAccountId:'ledger-bank',entryType:EntryType.DEBIT}));
  });
  it('rejects existing commission to avoid double-counting',async()=>{
    const {service,tx}=fixture({existingCommission:150});
    await expect(service.addMissingAepsCommission('aeps-tx',request,'owner-1'))
      .rejects.toThrow(BadRequestException);
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });
  it('rejects a second late commission supplement',async()=>{
    const {service,tx}=fixture({existingAdjustment:true});
    await expect(service.addMissingAepsCommission('aeps-tx',request,'owner-1'))
      .rejects.toThrow(/already recorded/);
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });
  it('rejects failed or reversed withdrawals',async()=>{
    const {service,tx}=fixture({status:TransactionStatus.REVERSED});
    await expect(service.addMissingAepsCommission('aeps-tx',request,'owner-1'))
      .rejects.toThrow(BadRequestException);
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });
  it('rejects cash collection when drawer has no open cash session without journal',async()=>{
    const {service,tx,validation,ledger}=fixture();
    validation.requireOpenCashDesk.mockRejectedValue(new BadRequestException('Open a cash session'));
    await expect(service.addMissingAepsCommission('aeps-tx',request,'owner-1'))
      .rejects.toThrow(/Open a cash session/);
    expect(ledger.post).not.toHaveBeenCalled();
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });
  it('rejects nonexistent source account for bank/UPI posting',async()=>{
    const {service,tx,validation}=fixture();
    validation.liquidAsset.mockResolvedValue({
      id:'wallet',accountType:AccountType.PROVIDER_WALLET,ledgerAccount:{id:'ledger-wallet'}
    });
    await expect(service.addMissingAepsCommission('aeps-tx',{
      ...request,receivedVia:'BANK_UPI',accountId:'wallet',
    },'owner-1')).rejects.toThrow(/bank or UPI/);
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });
});
