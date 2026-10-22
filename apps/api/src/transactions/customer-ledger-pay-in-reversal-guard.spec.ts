import { describe, expect, it, vi } from 'vitest';
import { Prisma, TransactionStatus, TransactionType } from '@prisma/client';
import { TransactionsService } from './transactions.service.js';
const dec=(n:number)=>new Prisma.Decimal(n);
function fixture(options:{payInCard?:string|null;laterPayout?:boolean;payable?:number}={}) {
 const original={
  id:'receipt',customerId:'customer-a',transactionNumber:'CLK-PAYIN',
  transactionAt:new Date('2026-10-19T09:36:18Z'),
  transactionType:TransactionType.CUSTOMER_LEDGER_ENTRY,
  status:TransactionStatus.COMPLETED,
  customerLedgerEntry:{
   direction:'PAY_IN',payableAmount:dec(options.payable??29600),
   customerCardId:options.payInCard??null,advanceAppliedAmount:dec(0),allocations:[],
  },
 };
 const tx={
  $queryRawUnsafe:vi.fn(async()=>[]),
  transaction:{findUnique:vi.fn(async()=>original)},
  customerLedgerEntryDetail:{findFirst:vi.fn(async()=>options.laterPayout?{transaction:{transactionNumber:'CLK-PAYOUT'}}:null)},
 };
 const prisma={$transaction:(callback:(db:typeof tx)=>Promise<unknown>)=>callback(tx)};
 const service=new TransactionsService(prisma as never,{} as never,{} as never,
  {} as never,{} as never,{} as never);
 return {service,tx};
}
describe('reversing Pay In with later Pay Outs',()=>{
 it('blocks orphaning an outgoing wallet payment',async()=>{
  const {service,tx}=fixture({laterPayout:true});
  await expect(service.reverse('receipt',{reason:'Remove incoming transfer'},'owner-a'))
   .rejects.toThrow(/CLK-PAYOUT.*edit the existing Pay Out/i);
  expect(tx.customerLedgerEntryDetail.findFirst).toHaveBeenCalled();
 });
 it('checks same-card and customer-level payouts',async()=>{
  const {service,tx}=fixture({laterPayout:true,payInCard:'card-1'});
  await expect(service.reverse('receipt',{reason:'Fix entry'},'owner-a')).rejects.toThrow('CLK-PAYOUT');
  expect(tx.customerLedgerEntryDetail.findFirst.mock.calls[0][0].where.OR)
   .toEqual([{customerCardId:'card-1'},{customerCardId:null}]);
 });
 it('skips dependent-payout check when Pay In created no credit',async()=>{
  const {service,tx}=fixture({payable:0});
  await expect(service.reverse('receipt',{reason:'Correct receipt'},'owner-a')).rejects.toThrow();
  expect(tx.customerLedgerEntryDetail.findFirst).not.toHaveBeenCalled();
 });
});
