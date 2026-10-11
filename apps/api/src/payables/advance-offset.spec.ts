import { describe, expect, it, vi } from 'vitest';
import { EntryType, PayableStatus, Prisma, TransactionStatus, TransactionType } from '@prisma/client';
import { PayablesService } from './payables.service.js';

const dec=(n:number)=>new Prisma.Decimal(n);
function fixture(options: { customer?:string; available?:number; remaining?:number; otherCard?:boolean }={}) {
  const payable={
    id:'payable-one',customerId:'customer-one',paidAmount:dec(0),offsetAmount:dec(0),
    originalAmount:dec(39200),remainingAmount:dec(options.remaining??39200),
    status:PayableStatus.PENDING,dueAt:new Date('2030-01-15'),
    sourceTransaction:{transactionType:TransactionType.CARD_SWIPE,transactionAt:new Date('2026-10-10'),
      cardSwipe:{customerCardId:'card-one'}},
  };
  const advance={
    id:'pay-out-one',direction:'PAY_OUT',customerCardId:options.otherCard?'card-two':null,
    receivableAmount:dec(options.available??15000),advanceAppliedAmount:dec(0),
    transaction:{customerId:options.customer??'customer-one',transactionType:TransactionType.CUSTOMER_LEDGER_ENTRY,
      status:TransactionStatus.COMPLETED,transactionAt:new Date('2026-10-09')},
  };
  const tx={
    $queryRawUnsafe:vi.fn(async()=>[]),
    customerPayable:{
      findUnique:vi.fn(async()=>payable),
      update:vi.fn(async({data}:any)=>{payable.remainingAmount=data.remainingAmount;
        payable.offsetAmount=dec(Number(payable.offsetAmount)+Number(data.offsetAmount.increment));
        payable.status=data.status;return {...payable};}),
    },
    customerLedgerEntryDetail:{
      findUnique:vi.fn(async()=>advance),
      update:vi.fn(async({data}:any)=>{advance.advanceAppliedAmount=dec(Number(advance.advanceAppliedAmount)+Number(data.advanceAppliedAmount.increment));return advance;}),
    },
    ledgerAccount:{findMany:vi.fn(async()=>[
      {id:'liability',ledgerCode:'SYS-CUST-PAYABLE'},{id:'receivable',ledgerCode:'SYS-CUST-RECEIVABLE'},
    ])},
    transaction:{create:vi.fn(async()=>({id:'offset-transaction',transactionNumber:'OFA-test'}))},
    customerAdvanceOffset:{create:vi.fn(async()=>({id:'offset-one'}))},
    auditLog:{create:vi.fn(async()=>({}))},
  };
  const ledger={post:vi.fn(async()=>({}))};
  const prisma={$transaction:(cb:(tx:any)=>unknown)=>cb(tx)};
  const idempotency={key:vi.fn(async()=> 'test-key')};
  const service=new PayablesService(prisma as never,ledger as never,{} as never,idempotency as never,{} as never);
  return {payable,advance,tx,ledger,service};
}
describe('Card Swipe matching against earlier customer Pay Out',()=>{
  it('settles ₹15,000 of a ₹39,200 swipe, without moving money a second time',async()=>{
    const f=fixture();
    await f.service.applyAdvance('payable-one',{advanceEntryId:'pay-out-one',amount:15000},'staff-one');
    expect(Number(f.payable.remainingAmount)).toBe(24200);
    expect(Number(f.payable.paidAmount)).toBe(0);
    expect(Number(f.payable.offsetAmount)).toBe(15000);
    expect(Number(f.advance.advanceAppliedAmount)).toBe(15000);
    const legs=(f.ledger.post.mock.calls[0] as any[])[4];
    expect(legs).toEqual([
      expect.objectContaining({entryType:EntryType.DEBIT,ledgerAccountId:'liability',amount:15000}),
      expect.objectContaining({entryType:EntryType.CREDIT,ledgerAccountId:'receivable',amount:15000}),
    ]);
    expect(f.tx.auditLog.create).toHaveBeenCalledTimes(2);
  });
  it('rejects advances belonging to a different customer',async()=>{
    const f=fixture({customer:'another-customer'});
    await expect(f.service.applyAdvance('payable-one',{advanceEntryId:'pay-out-one',amount:1000},'staff-one')).rejects.toThrow('this customer');
    expect(f.tx.transaction.create).not.toHaveBeenCalled();
  });
  it('does not allow an earlier advance to be overused',async()=>{
    const f=fixture({available:1000});
    await expect(f.service.applyAdvance('payable-one',{advanceEntryId:'pay-out-one',amount:1000.01},'staff-one')).rejects.toThrow('insufficient balance');
  });
  it('rejects a card-specific advance for a different card',async()=>{
    const f=fixture({otherCard:true});
    await expect(f.service.applyAdvance('payable-one',{advanceEntryId:'pay-out-one',amount:150},'staff-one')).rejects.toThrow('customer and card');
  });
  it('rejects over-paying the swipe',async()=>{
    const f=fixture({remaining:2000});
    await expect(f.service.applyAdvance('payable-one',{advanceEntryId:'pay-out-one',amount:2500},'staff-one')).rejects.toThrow('payable remaining');
  });
});
