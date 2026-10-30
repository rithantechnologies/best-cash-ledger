import { BadRequestException } from '@nestjs/common';
import { Prisma, RoleName, TransactionType } from '@prisma/client';
import { validate } from 'class-validator';
import { TransactionsService } from './transactions.service.js';
import { CreateCardSwipeDto } from './dto/create-card-swipe.dto.js';

const historic=new Date('2026-10-15T07:37:00.000Z');
function setup() {
  let num=0;
  const tx:any={
    financialAccount:{findFirst:vi.fn().mockResolvedValue({
      id:'wallet-1', accountType:'PROVIDER_WALLET', providerId:'provider-1',
      accountName:'Provider wallet', ledgerAccount:{id:'ledger-wallet'},
    })},
    ledgerAccount:{findMany:vi.fn().mockResolvedValue([
      'SYS-CUST-PAYABLE','SYS-COMMISSION','SYS-PROVIDER-CLEARING','SYS-PROVIDER-CHARGE','SYS-BANK-CHARGE'
    ].map(ledgerCode=>({id:ledgerCode,ledgerCode})))},
    transaction:{create:vi.fn(({data}:any)=>Promise.resolve({
      id:'transaction-'+(++num),transactionNumber:data.transactionNumber,
      transactionType:data.transactionType,grossAmount:data.grossAmount,
      netAmount:data.netAmount,status:data.status,customerId:data.customerId,...data,
    }))},
    customerPayable:{
      create:vi.fn(({data}:any)=>Promise.resolve({id:'payable-1',...data})),
      update:vi.fn(({data}:any)=>Promise.resolve({id:'payable-1',...data})),
    },
    cardSwipeDetail:{create:vi.fn().mockResolvedValue({})},
    transactionCharge:{create:vi.fn().mockResolvedValue({})},
    transactionCommission:{create:vi.fn().mockResolvedValue({})},
    payablePayment:{create:vi.fn().mockResolvedValue({})},
    auditLog:{create:vi.fn().mockResolvedValue({})},
  };
  const prisma:any={
    providerGateway:{findFirst:vi.fn().mockResolvedValue({defaultChargeRate:1.8})},
    $transaction:vi.fn((fn:(tx:any)=>Promise<any>)=>fn(tx)),
  };
  const ledger:any={post:vi.fn().mockResolvedValue({})};
  const validation:any={
    activeCustomer:vi.fn().mockResolvedValue({}),
    customerCard:vi.fn().mockResolvedValue({}),
    providerGateway:vi.fn().mockResolvedValue({}),
    paymentTerm:vi.fn().mockResolvedValue({}),
    lockAccount:vi.fn().mockResolvedValue({}),
    liquidAsset:vi.fn().mockResolvedValue({
      id:'wallet-1',accountType:'PROVIDER_WALLET',providerId:'provider-1',
      accountName:'Provider wallet',ledgerAccount:{id:'ledger-wallet'},
    }),
    ensureSufficientFunds:vi.fn().mockResolvedValue({}),
    customerReceiptAccount:vi.fn().mockResolvedValue({
      id:'drawer-1',accountType:'CASH',accountName:'Staff Cash Drawer',
      ledgerAccount:{id:'ledger-drawer-1'},
    }),
    requireOpenCashDesk:vi.fn().mockResolvedValue({}),
  };
  const settlements:any={
    createForSource:vi.fn().mockResolvedValue({id:'settlement-1'}),
    autoReceive:vi.fn().mockResolvedValue({receipt:{id:'receipt-1'}}),
  };
  const idempotency:any={key:vi.fn().mockResolvedValue('safe-test-idem')};
  const payoutCharges:any={resolve:vi.fn().mockResolvedValue(null)};
  const service=new TransactionsService(prisma,ledger,validation,idempotency,settlements,payoutCharges);
  const input:CreateCardSwipeDto={
    customerId:'customer-1',customerCardId:'card-1',
    swipeAmount:40000,providerId:'provider-1',gatewayId:'gateway-1',
    providerChargeRate:1.8,commissionRate:3,paymentTermId:'term-1',
    dueAt:new Date('2026-10-15T07:37:00Z').toISOString(),
    transactionAt:historic.toISOString(),settledNow:true,
    customerPayments:[{sourceAccountId:'wallet-1',amount:38800}],
  };
  return {service,tx,prisma,ledger,settlements,input};
}

describe('backdated Card Swipe',()=>{
  it('accepts an optional historical ISO timestamp in the Card Swipe DTO',async()=>{
    const dto=Object.assign(new CreateCardSwipeDto(),setup().input);
    // This check focuses on the optional business date, not nested payouts.
    delete dto.customerPayments;
    expect(await validate(dto)).toEqual([]);
  });
  it('posts swipe, settlement receipt, immediate payout and journals on the selected business date',async()=>{
    const {service,tx,ledger,settlements,input}=setup();
    const result=await service.createCardSwipe(input,'owner-1',RoleName.OWNER);
    expect(result.payoutTransactions).toHaveLength(1);
    expect(tx.transaction.create).toHaveBeenCalledTimes(2);
    expect(tx.transaction.create.mock.calls.map(([v]:any)=>v.data.transactionAt))
      .toEqual([historic,historic]);
    expect(tx.payablePayment.create.mock.calls[0][0].data.paymentDate).toEqual(historic);
    expect(ledger.post.mock.calls).toHaveLength(2);
    expect(ledger.post.mock.calls.map((args:any)=>args[5])).toEqual([historic,historic]);
    expect(settlements.autoReceive).toHaveBeenCalledWith(
      tx,'settlement-1','wallet-1',39280,'owner-1',undefined,undefined,historic
    );
    expect(tx.customerPayable.create.mock.calls[0][0].data.dueAt).toEqual(historic);
  });
  it('rejects future swipe dates before writing transactions',async()=>{
    const {service,prisma,tx,input}=setup();
    input.transactionAt=new Date(Date.now()+3600_000).toISOString();
    await expect(service.createCardSwipe(input,'owner-1',RoleName.OWNER)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });
  it('defaults to current date when no business date is supplied',async()=>{
    const {service,tx,input}=setup();
    delete input.transactionAt;
    const before=Date.now();
    await service.createCardSwipe(input,'owner-1',RoleName.OWNER);
    const timestamp=tx.transaction.create.mock.calls[0][0].data.transactionAt as Date;
    expect(timestamp.getTime()).toBeGreaterThanOrEqual(before);
    expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe('Card Swipe customer fee settlement',()=>{
  it('retains deducted-fee mode for all existing callers',async()=>{
    const {service,tx,input}=setup();
    delete input.customerPayments;
    const result=await service.createCardSwipe(input,'owner-1',RoleName.OWNER);
    expect(Number(result.payable.originalAmount)).toBe(38800);
    expect(tx.cardSwipeDetail.create.mock.calls[0][0].data.commissionSettlementMode).toBe('DEDUCT');
  });
  it('allows a full payout when the fee is received separately in cash',async()=>{
    const {service,tx,ledger,input}=setup();
    input.swipeAmount=30000;
    input.commissionRate=2.2;
    input.commissionSettlementMode='SEPARATE';
    input.commissionReceiptAccountId='drawer-1';
    input.customerPayments=[{sourceAccountId:'wallet-1',amount:30000}];
    const result=await service.createCardSwipe(input,'owner-1',RoleName.OWNER);
    expect(Number(tx.customerPayable.create.mock.calls[0][0].data.originalAmount)).toBe(30000);
    expect(Number(result.payable.paidAmount)).toBe(30000);
    expect(Number(result.payable.remainingAmount)).toBe(0);
    expect(tx.cardSwipeDetail.create.mock.calls[0][0].data.commissionSettlementMode).toBe('SEPARATE');
    expect(tx.cardSwipeDetail.create.mock.calls[0][0].data.commissionReceiptAccountId).toBe('drawer-1');
    expect(tx.transactionCommission.create).toHaveBeenCalledTimes(1);
    const swipeEntries=ledger.post.mock.calls[0][4];
    const debit=swipeEntries.filter((x:any)=>x.entryType==='DEBIT').reduce((t:number,x:any)=>t+x.amount,0);
    const credit=swipeEntries.filter((x:any)=>x.entryType==='CREDIT').reduce((t:number,x:any)=>t+x.amount,0);
    expect(debit).toBeCloseTo(credit);
    expect(swipeEntries.find((x:any)=>x.ledgerAccountId==='ledger-drawer-1')).toMatchObject({
      entryType:'DEBIT',amount:660,
    });
    expect(swipeEntries.find((x:any)=>x.ledgerAccountId==='SYS-CUST-PAYABLE')).toMatchObject({
      entryType:'CREDIT',amount:30000,
    });
    expect(swipeEntries.filter((x:any)=>x.ledgerAccountId==='SYS-COMMISSION')).toHaveLength(1);
  });
});
