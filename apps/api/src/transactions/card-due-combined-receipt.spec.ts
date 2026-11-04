import { describe, expect, it, vi } from 'vitest';
import { AccountType, EntryType, Prisma, RoleName, TransactionStatus, TransactionType } from '@prisma/client';
import { CardDueClearingService } from './card-due-clearing.service.js';

const dec=(n:number)=>new Prisma.Decimal(n);
function fixture(options?: {principal?:number;commission?:number;accountType?:AccountType}) {
 const principal=options?.principal??1200,commission=options?.commission??2400;
 const accountType=options?.accountType??AccountType.UPI;
 const clearing={
  id:'due-id',transactionId:'card-due-id',customerCardId:'card-id',
  principalRecovered:dec(40000-principal),principalRemaining:dec(principal),
  commissionAmount:dec(commission),commissionCollected:dec(0),commissionRemaining:dec(commission),
  transaction:{customerId:'customer-id',status:TransactionStatus.PARTIALLY_PAID},
 };
 const tx:any={
  $queryRawUnsafe:vi.fn().mockResolvedValue([]),
  cardDueClearingDetail:{findUnique:vi.fn().mockResolvedValue(clearing),update:vi.fn().mockResolvedValue({})},
  ledgerAccount:{findUnique:vi.fn().mockResolvedValue({id:'receivable-ledger'})},
  transaction:{create:vi.fn().mockResolvedValue({id:'receipt-tx',transactionNumber:'CDP-1'}),update:vi.fn().mockResolvedValue({})},
  customerLedgerEntryDetail:{create:vi.fn().mockResolvedValue({id:'payin-detail'})},
  customerLedgerAllocation:{create:vi.fn().mockResolvedValue({})},
  cardDueCommissionCollection:{create:vi.fn().mockResolvedValue({})},
  auditLog:{create:vi.fn().mockResolvedValue({})},
 };
 const account={id:'destination-id',accountType,accountName:'Customer UPI',ledgerAccount:{id:'bank-ledger'}};
 const validation={liquidAsset:vi.fn().mockResolvedValue(account),requireOpenCashDesk:vi.fn().mockResolvedValue({})};
 const prisma={$transaction:vi.fn(async(fn:(tx:any)=>Promise<any>)=>fn(tx))};
 const ledger={post:vi.fn().mockResolvedValue({})};
 const idempotency={key:vi.fn().mockResolvedValue('unique-test-key')};
 const service=new CardDueClearingService(prisma as never,ledger as never,validation as never,idempotency as never,{} as never);
 vi.spyOn(service,'get').mockResolvedValue({} as never);
 return {tx,prisma,service,ledger,validation};
}
describe('Card Due combined principal and commission receipt',()=>{
 it('receives exactly ₹3600 once, allocates ₹1200 principal and ₹2400 accrued commission',async()=>{
  const f=fixture();
  const result=await f.service.addCombinedReceipt('card-due-id',{amount:3600,destinationAccountId:'destination-id',referenceNumber:'UTR-A'},'staff-id',RoleName.STAFF);
  expect(result).toMatchObject({amount:3600,principalApplied:1200,commissionApplied:2400,transactionId:'receipt-tx'});
  expect(f.tx.transaction.create).toHaveBeenCalledWith({data:expect.objectContaining({
   transactionType:TransactionType.CUSTOMER_LEDGER_ENTRY,grossAmount:dec(3600),netAmount:dec(3600),
  })});
  expect(f.tx.customerLedgerEntryDetail.create).toHaveBeenCalledWith({data:expect.objectContaining({
   amount:dec(3600),receivableAmount:dec(3600),financialAccountId:'destination-id',
  })});
  expect(f.tx.customerLedgerAllocation.create).toHaveBeenCalledWith({data:expect.objectContaining({
   targetType:'CARD_DUE',cardDueClearingId:'due-id',amount:dec(1200),
  })});
  expect(f.tx.cardDueCommissionCollection.create).toHaveBeenCalledWith({data:expect.objectContaining({
   amount:dec(2400),paymentMode:AccountType.UPI,transactionId:'receipt-tx',
  })});
  expect(f.tx.cardDueClearingDetail.update).toHaveBeenCalledWith({where:{id:'due-id'},data:expect.objectContaining({
   principalRemaining:dec(0),commissionRemaining:dec(0),
  })});
  expect(f.ledger.post).toHaveBeenCalledTimes(1);
  expect(f.ledger.post.mock.calls[0][4]).toEqual([
   expect.objectContaining({ledgerAccountId:'bank-ledger',entryType:EntryType.DEBIT,amount:3600}),
   expect.objectContaining({ledgerAccountId:'receivable-ledger',entryType:EntryType.CREDIT,amount:3600}),
  ]);
  expect(f.tx.transactionCommission).toBeUndefined(); // collection is not new earnings
  expect(f.tx.auditLog.create).toHaveBeenCalled();
 });
 it('allocates partial receipts to principal first',async()=>{
  const f=fixture();
  const result=await f.service.addCombinedReceipt('card-due-id',{amount:800,destinationAccountId:'destination-id'},'staff-id',RoleName.STAFF);
  expect(result).toMatchObject({principalApplied:800,commissionApplied:0});
  expect(f.tx.customerLedgerAllocation.create).toHaveBeenCalledTimes(1);
  expect(f.tx.cardDueCommissionCollection.create).not.toHaveBeenCalled();
 });
 it('splits a partial receipt across the two components without rounding drift',async()=>{
  const f=fixture();
  const result=await f.service.addCombinedReceipt('card-due-id',{amount:1200.37,destinationAccountId:'destination-id'},'staff-id',RoleName.STAFF);
  expect(result).toMatchObject({principalApplied:1200,commissionApplied:0.37});
  expect(f.ledger.post.mock.calls[0][4][0].amount).toBe(1200.37);
 });
 it('allows a bank account with no gateway processing charges',async()=>{
  const f=fixture({accountType:AccountType.BANK});
  await f.service.addCombinedReceipt('card-due-id',{amount:3600,destinationAccountId:'destination-id'},'owner-id',RoleName.OWNER);
  expect(f.tx.cardDueCommissionCollection.create).toHaveBeenCalledWith({data:expect.objectContaining({paymentMode:AccountType.BANK})});
  expect(f.validation.requireOpenCashDesk).not.toHaveBeenCalled();
 });
 it('rejects overpayment without creating a transaction',async()=>{
  const f=fixture({principal:1200,commission:240});
  await expect(f.service.addCombinedReceipt('card-due-id',{amount:3600,destinationAccountId:'destination-id'},'staff-id',RoleName.STAFF))
   .rejects.toThrow('exceeds this Card Due');
  expect(f.tx.transaction.create).not.toHaveBeenCalled();
  expect(f.ledger.post).not.toHaveBeenCalled();
 });
 it('rejects fractions of paise before touching the database',async()=>{
  const f=fixture();
  await expect(f.service.addCombinedReceipt('card-due-id',{amount:0.125,destinationAccountId:'destination-id'},'staff-id',RoleName.STAFF))
   .rejects.toThrow('paise');
  expect(f.prisma.$transaction).not.toHaveBeenCalled();
 });
});
