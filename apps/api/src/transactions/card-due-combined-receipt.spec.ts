import { describe, expect, it, vi } from 'vitest';
import { AccountType, EntryType, Prisma, RoleName, TransactionStatus, TransactionType } from '@prisma/client';
import { CardDueClearingService } from './card-due-clearing.service.js';

const dec=(n:number)=>new Prisma.Decimal(n);
function fixture(options?:{principal?:number;commission?:number;accountType?:AccountType;twoCases?:boolean}){
 const accountType=options?.accountType??AccountType.UPI;
 const newest={
  id:'due-new',transactionId:'new-tx',customerCardId:'card-new',
  dueAmount:dec(40000),principalRecovered:dec(40000-(options?.principal??1200)),
  principalRemaining:dec(options?.principal??1200),commissionAmount:dec(options?.commission??1200),
  commissionCollected:dec(0),commissionRemaining:dec(options?.commission??1200),
  transaction:{id:'new-tx',transactionNumber:'CDC-NEW',customerId:'customer-1',
   status:TransactionStatus.PARTIALLY_PAID,transactionAt:new Date('2026-11-04T08:00:00Z')},
 };
 const older={
  id:'due-old',transactionId:'old-tx',customerCardId:'card-old',
  dueAmount:dec(40000),principalRecovered:dec(40000),principalRemaining:dec(0),
  commissionAmount:dec(1200),commissionCollected:dec(0),commissionRemaining:dec(1200),
  transaction:{id:'old-tx',transactionNumber:'CDC-OLD',customerId:'customer-1',
   status:TransactionStatus.COMPLETED,transactionAt:new Date('2026-11-03T08:00:00Z')},
 };
 const cases=options?.twoCases?[older,newest]:[newest];
 const tx:any={
  $queryRawUnsafe:vi.fn().mockResolvedValue([]),
  cardDueClearingDetail:{
   findUnique:vi.fn().mockImplementation(({where}:{where:{id?:string;transactionId?:string}})=>Promise.resolve(
    cases.find(c=>c.id===where.id||c.transactionId===where.transactionId)??null)),
   findMany:vi.fn().mockImplementation(({select}:{select?:{id?:boolean}})=>Promise.resolve(
    select?cases.map(c=>({id:c.id})):cases)),
   update:vi.fn().mockImplementation(({where,data}:{where:{id:string};data:Record<string,unknown>})=>{
    const c=cases.find(c=>c.id===where.id)!;Object.assign(c,data);return Promise.resolve(c);
   }),
  },
  ledgerAccount:{findUnique:vi.fn().mockResolvedValue({id:'receivable-ledger'})},
  transaction:{create:vi.fn().mockResolvedValue({id:'receipt-tx',transactionNumber:'CDP-1'}),update:vi.fn().mockResolvedValue({})},
  customerLedgerEntryDetail:{create:vi.fn().mockResolvedValue({id:'payin-detail'})},
  customerLedgerAllocation:{create:vi.fn().mockResolvedValue({})},
  cardDueCommissionCollection:{create:vi.fn().mockResolvedValue({})},
  auditLog:{create:vi.fn().mockResolvedValue({})},
 };
 const account={id:'destination-id',accountType,accountName:'INDIAN',ledgerAccount:{id:'bank-ledger'}};
 const validation={liquidAsset:vi.fn().mockResolvedValue(account),requireOpenCashDesk:vi.fn().mockResolvedValue({})};
 const prisma={$transaction:vi.fn(async(fn:(tx:any)=>Promise<any>)=>fn(tx))};
 const ledger={post:vi.fn().mockResolvedValue({})};
 const idempotency={key:vi.fn().mockResolvedValue('unique-test-key')};
 const service=new CardDueClearingService(prisma as never,ledger as never,validation as never,idempotency as never,{} as never);
 vi.spyOn(service,'get').mockResolvedValue({} as never);
 return {tx,prisma,service,ledger,validation,cases};
}
const request={amount:3600,destinationAccountId:'destination-id',referenceNumber:'UTR-3600'};

describe('customer-wide Card Due combined payment',()=>{
 it('posts ONE ₹3600 receipt and allocates across two Card Dues, principal before commission',async()=>{
  const f=fixture({twoCases:true});
  const result=await f.service.addCombinedReceipt('new-tx',request,'staff-1',RoleName.STAFF);
  expect(result).toMatchObject({amount:3600,principalApplied:1200,commissionApplied:2400,transactionId:'receipt-tx'});
  expect(result.allocations).toEqual([
   {transactionNumber:'CDC-OLD',principalApplied:0,commissionApplied:1200},
   {transactionNumber:'CDC-NEW',principalApplied:1200,commissionApplied:1200},
  ]);
  expect(f.tx.transaction.create).toHaveBeenCalledTimes(1);
  expect(f.tx.transaction.create).toHaveBeenCalledWith({data:expect.objectContaining({
   transactionType:TransactionType.CUSTOMER_LEDGER_ENTRY,grossAmount:dec(3600),netAmount:dec(3600),
  })});
  expect(f.tx.customerLedgerEntryDetail.create).toHaveBeenCalledWith({data:expect.objectContaining({
   amount:dec(3600),receivableAmount:dec(3600),financialAccountId:'destination-id',customerCardId:null,
  })});
  const allocations=f.tx.customerLedgerAllocation.create.mock.calls.map((call:any[])=>call[0].data);
  expect(allocations).toEqual([
   expect.objectContaining({targetType:'CARD_DUE_COMMISSION',cardDueClearingId:'due-old',amount:dec(1200)}),
   expect.objectContaining({targetType:'CARD_DUE',cardDueClearingId:'due-new',amount:dec(1200)}),
   expect.objectContaining({targetType:'CARD_DUE_COMMISSION',cardDueClearingId:'due-new',amount:dec(1200)}),
  ]);
  expect(f.tx.cardDueCommissionCollection.create).not.toHaveBeenCalled();
  expect(f.ledger.post).toHaveBeenCalledTimes(1);
  expect(f.ledger.post.mock.calls[0][4]).toEqual([
   expect.objectContaining({ledgerAccountId:'bank-ledger',entryType:EntryType.DEBIT,amount:3600}),
   expect.objectContaining({ledgerAccountId:'receivable-ledger',entryType:EntryType.CREDIT,amount:3600}),
  ]);
  expect(f.cases.every(c=>Number(c.principalRemaining)===0&&Number(c.commissionRemaining)===0)).toBe(true);
  expect(f.tx.auditLog.create).toHaveBeenCalledTimes(2);
  expect(f.tx.$queryRawUnsafe).toHaveBeenCalledTimes(2);
 });
 it('automatically allocates an ₹800 partial receipt to outstanding principal first',async()=>{
  const f=fixture();
  const result=await f.service.addCombinedReceipt('new-tx',{amount:800,destinationAccountId:'destination-id'},'staff-1',RoleName.STAFF);
  expect(result).toMatchObject({principalApplied:800,commissionApplied:0});
  expect(f.tx.customerLedgerAllocation.create).toHaveBeenCalledTimes(1);
 });
 it('supports paise and never rounds funds into extra commission',async()=>{
  const f=fixture();
  const result=await f.service.addCombinedReceipt('new-tx',{amount:1200.37,destinationAccountId:'destination-id'},'staff-1',RoleName.STAFF);
  expect(result).toMatchObject({principalApplied:1200,commissionApplied:0.37});
  expect(f.ledger.post.mock.calls[0][4][0].amount).toBe(1200.37);
 });
 it('accepts bank account and requires cash desk for cash account',async()=>{
  const bank=fixture({accountType:AccountType.BANK,twoCases:true});
  await bank.service.addCombinedReceipt('new-tx',request,'staff-1',RoleName.STAFF);
  expect(bank.validation.requireOpenCashDesk).not.toHaveBeenCalled();
  const cash=fixture({accountType:AccountType.CASH,twoCases:true});
  await cash.service.addCombinedReceipt('new-tx',request,'staff-1',RoleName.STAFF);
  expect(cash.validation.requireOpenCashDesk).toHaveBeenCalledTimes(1);
 });
 it('rejects amount exceeding all Card Due balances before posting',async()=>{
  const f=fixture({principal:1200,commission:240});
  await expect(f.service.addCombinedReceipt('new-tx',request,'staff-1',RoleName.STAFF)).rejects.toThrow('total open Card Due');
  expect(f.tx.transaction.create).not.toHaveBeenCalled();
  expect(f.ledger.post).not.toHaveBeenCalled();
 });
 it('rejects malformed fractions of paise before touching the database',async()=>{
  const f=fixture();
  await expect(f.service.addCombinedReceipt('new-tx',{amount:0.125,destinationAccountId:'destination-id'},'staff-1',RoleName.STAFF)).rejects.toThrow('paise');
  expect(f.prisma.$transaction).not.toHaveBeenCalled();
 });
});
