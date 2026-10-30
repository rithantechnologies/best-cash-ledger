import { BadRequestException } from '@nestjs/common';
import { Prisma, RoleName, TransactionStatus, TransactionType } from '@prisma/client';
import { TransactionsService } from './transactions.service.js';

function setup() {
  const source:any={
    id:'swipe-1',transactionNumber:'CCS-TEST',transactionType:TransactionType.CARD_SWIPE,
    status:TransactionStatus.COMPLETED,customerId:'customer-1',
    netAmount:new Prisma.Decimal(29340),
    cardSwipe:{
      commissionAmount:new Prisma.Decimal(660),
      commissionSettlementMode:'DEDUCT',
      commissionReceiptAccountId:null,
    },
    payable:{
      id:'payable-1',originalAmount:new Prisma.Decimal(29340),
      remainingAmount:new Prisma.Decimal(29340),
      paidAmount:new Prisma.Decimal(0),offsetAmount:new Prisma.Decimal(0),
      dueAt:new Date('2030-01-01'),
      status:'PENDING',
    },
  };
  const tx:any={
    $queryRawUnsafe:vi.fn().mockResolvedValue([]),
    transaction:{
      findUnique:vi.fn().mockImplementation(()=>Promise.resolve(source)),
      create:vi.fn(({data}:any)=>Promise.resolve({id:'fee-receipt-1',...data})),
      update:vi.fn().mockResolvedValue({}),
    },
    ledgerAccount:{findUnique:vi.fn().mockResolvedValue({id:'SYS-CUST-PAYABLE'})},
    customerPayable:{update:vi.fn(({data}:any)=>Promise.resolve({id:'payable-1',...data}))},
    cardSwipeDetail:{update:vi.fn().mockResolvedValue({})},
    auditLog:{create:vi.fn().mockResolvedValue({}),createMany:vi.fn().mockResolvedValue({})},
  };
  const prisma:any={$transaction:vi.fn((fn:(tx:any)=>Promise<any>)=>fn(tx))};
  const ledger:any={post:vi.fn().mockResolvedValue({})};
  const validation:any={
    lockAccount:vi.fn().mockResolvedValue({}),
    customerReceiptAccount:vi.fn().mockResolvedValue({
      id:'drawer-1',accountType:'CASH',accountName:'Staff Cash Drawer',
      ledgerAccount:{id:'ledger-drawer-1'},
    }),
    requireOpenCashDesk:vi.fn().mockResolvedValue({}),
  };
  const service=new TransactionsService(prisma,ledger,validation,{} as any,{} as any,{} as any);
  return {source,tx,ledger,validation,service};
}

describe('existing Card Swipe fee already received separately',()=>{
  it('moves 660 from drawer to payable without posting commission income twice',async()=>{
    const {service,tx,ledger,validation}=setup();
    const result=await service.recordCardSwipeCommissionReceipt(
      'swipe-1',{receiptAccountId:'drawer-1',referenceNumber:'CASH-TEST'},'owner-1',RoleName.OWNER,
    );
    expect(result.receiptAmount).toBe(660);
    expect(Number(result.payable.originalAmount)).toBe(30000);
    expect(Number(result.payable.remainingAmount)).toBe(30000);
    expect(validation.requireOpenCashDesk).toHaveBeenCalled();
    const entries=ledger.post.mock.calls[0][4];
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ledgerAccountId:'ledger-drawer-1',entryType:'DEBIT',amount:660});
    expect(entries[1]).toMatchObject({ledgerAccountId:'SYS-CUST-PAYABLE',entryType:'CREDIT',amount:660});
    expect(entries.some((entry:any)=>entry.ledgerAccountId==='SYS-COMMISSION')).toBe(false);
    expect(tx.cardSwipeDetail.update.mock.calls[0][0].data.commissionSettlementMode).toBe('SEPARATE');
    expect(tx.auditLog.createMany).toHaveBeenCalled();
  });
  it('rejects repeat collection without touching account balances',async()=>{
    const {service,source,tx,ledger}=setup();
    source.cardSwipe.commissionSettlementMode='SEPARATE';
    source.cardSwipe.commissionReceiptAccountId='drawer-1';
    await expect(service.recordCardSwipeCommissionReceipt(
      'swipe-1',{receiptAccountId:'drawer-1'},'owner-1',RoleName.OWNER,
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(ledger.post).not.toHaveBeenCalled();
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });
  it('blocks staff from recording a fee into the owner-only reserve',async()=>{
    const {service,validation,ledger}=setup();
    validation.customerReceiptAccount.mockResolvedValueOnce({
      id:'main-cash',accountType:'CASH',accountName:'Main Cash Reserve',
      ledgerAccount:{id:'main-ledger'},
    });
    await expect(service.recordCardSwipeCommissionReceipt(
      'swipe-1',{receiptAccountId:'main-cash'},'staff-1',RoleName.STAFF,
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(ledger.post).not.toHaveBeenCalled();
  });
});
