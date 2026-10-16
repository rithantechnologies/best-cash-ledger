import { describe, expect, it, vi } from 'vitest';
import { AccountNature, AccountType, EntryType, JournalStatus, RoleName, TransactionStatus, TransactionType, Prisma } from '@prisma/client';
import { TransactionsService } from './transactions.service.js';

const oldAccount = { id:'bank-a', accountName:'Old bank', accountType:AccountType.BANK,
  accountNature:AccountNature.ASSET, openingBalance:new Prisma.Decimal(0), ledgerAccount:{ id:'asset-a' } };
const newAccount = { id:'bank-b', accountName:'New bank', accountType:AccountType.BANK,
  accountNature:AccountNature.ASSET, openingBalance:new Prisma.Decimal(0), ledgerAccount:{ id:'asset-b' } };
const decimal = (n:number)=>new Prisma.Decimal(n);
const input = (changes:Record<string,unknown>={})=>({
  customerId:'customer-a',customerCardId:null,direction:'PAY_IN' as const,amount:60600,
  receivableAmount:0,payableAmount:60600,financialAccountId:'bank-a',
  transactionAt:'2026-10-15T18:09:23.000Z',
  remarks:'Pay In',referenceNumber:null,notes:null,reason:'Correcting a staff entry',
  ...changes,
});
function setup(overrides: { allocations?:unknown[], oldBalance?:number }={}) {
  const journal={ id:'journal-a',status:JournalStatus.POSTED,postingDate:new Date('2026-10-15T18:09:23Z'),
    entries:[
      {id:'e1',ledgerAccountId:'asset-a',entryType:EntryType.DEBIT,amount:decimal(60600),customerId:'customer-a',description:'Customer Pay In'},
      {id:'e2',ledgerAccountId:'sys-pay',entryType:EntryType.CREDIT,amount:decimal(60600),customerId:'customer-a',description:'Customer credit'},
    ],
  };
  const detail={id:'detail-a',direction:'PAY_IN',customerCardId:null,
    amount:decimal(60600),receivableAmount:decimal(0),payableAmount:decimal(60600),
    advanceAppliedAmount:decimal(0),allocations:overrides.allocations||[],advanceOffsets:[],
    financialAccountId:'bank-a',financialAccount:oldAccount,remarks:'Pay In',payoutDestination:null};
  const original={id:'tx-a',transactionNumber:'CLK-TEST',status:TransactionStatus.COMPLETED,
    transactionType:TransactionType.CUSTOMER_LEDGER_ENTRY,customerId:'customer-a',
    transactionAt:new Date(input().transactionAt),referenceNumber:null,notes:null,
    customerLedgerEntry:detail,journal,charges:[]};
  const db={
    $queryRawUnsafe:vi.fn().mockResolvedValue([]),
    transaction:{findUnique:vi.fn().mockResolvedValue(original),update:vi.fn().mockResolvedValue({id:'tx-a'})},
    customerAdvanceOffset:{findFirst:vi.fn().mockResolvedValue(null)},
    cashSession:{findFirst:vi.fn().mockResolvedValue(null)},
    ledgerAccount:{findMany:vi.fn().mockResolvedValue([
      {ledgerCode:'SYS-CUST-RECEIVABLE',id:'sys-rec'},
      {ledgerCode:'SYS-CUST-PAYABLE',id:'sys-pay'},
      {ledgerCode:'SYS-PROVIDER-CHARGE',id:'sys-charge'},
    ])},
    ledgerEntry:{deleteMany:vi.fn().mockResolvedValue({count:2}),createMany:vi.fn().mockResolvedValue({count:2})},
    ledgerJournal:{update:vi.fn().mockResolvedValue({})},
    customerLedgerEntryDetail:{update:vi.fn().mockResolvedValue({})},
    transactionCharge:{deleteMany:vi.fn().mockResolvedValue({})},
    auditLog:{create:vi.fn().mockResolvedValue({})},
  };
  const prisma={ $transaction:(f:(client:typeof db)=>Promise<unknown>)=>f(db) };
  const validation={
    activeCustomer:vi.fn().mockResolvedValue({id:'customer-a'}),
    customerCard:vi.fn().mockResolvedValue({}),
    lockAccount:vi.fn().mockResolvedValue(null),
    liquidAsset:vi.fn().mockImplementation(async (_tx:unknown,id:string)=>id==='bank-b'?newAccount:oldAccount),
    balance:vi.fn().mockResolvedValue(overrides.oldBalance??100000),
  };
  const service=new TransactionsService(prisma as never,null as never,validation as never,
    null as never,null as never,{resolve:vi.fn().mockResolvedValue(null)} as never);
  return {service,db,validation};
}
describe('customer ledger full edits',()=>{
  it('edits a posted Pay In amount and keeps journal balanced and auditable',async()=>{
    const {service,db}=setup();
    await service.updateCustomerLedgerEntry('tx-a',input({
      amount:60800,receivableAmount:0,payableAmount:60800,
    }), 'owner-a',RoleName.OWNER);
    const entries=db.ledgerEntry.createMany.mock.calls[0][0].data as Array<{amount:Prisma.Decimal,entryType:EntryType}>;
    expect(entries.reduce((n,e)=>n+(e.entryType===EntryType.DEBIT?1:-1)*Number(e.amount),0)).toBe(0);
    expect(db.customerLedgerEntryDetail.update.mock.calls[0][0].data.amount.toString()).toBe('60800');
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe('UPDATE_CUSTOMER_LEDGER_ENTRY');
    expect(db.auditLog.create.mock.calls[0][0].data.oldValues.postedJournal.entries).toHaveLength(2);
  });
  it('moves an incoming payment to the corrected bank while preserving totals',async()=>{
    const {service,db}=setup();
    await service.updateCustomerLedgerEntry('tx-a',input({financialAccountId:'bank-b'}),
      'owner-a',RoleName.OWNER);
    const entries=db.ledgerEntry.createMany.mock.calls[0][0].data as Array<{ledgerAccountId:string}>;
    expect(entries.map(e=>e.ledgerAccountId)).toContain('asset-b');
    expect(entries.map(e=>e.ledgerAccountId)).not.toContain('asset-a');
  });
  it('blocks editing allocated dues instead of corrupting posted obligations',async()=>{
    const {service,db}=setup({allocations:[{amount:decimal(200),targetType:'CARD_DUE'}]});
    await expect(service.updateCustomerLedgerEntry('tx-a',input({amount:60700,payableAmount:60700}),
       'owner-a',RoleName.OWNER)).rejects.toThrow(/matched/i);
    expect(db.ledgerEntry.deleteMany).not.toHaveBeenCalled();
  });
  it('rejects insufficient funds for removing a prior customer receipt',async()=>{
    const {service,db}=setup({oldBalance:100});
    await expect(service.updateCustomerLedgerEntry('tx-a',input({amount:60400,payableAmount:60400}),
       'owner-a',RoleName.OWNER)).rejects.toThrow(/insufficient balance/i);
    expect(db.ledgerEntry.createMany).not.toHaveBeenCalled();
  });
});
