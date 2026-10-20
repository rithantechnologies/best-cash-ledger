import { describe, expect, it, vi } from 'vitest';
import { TransactionsService } from './transactions.service.js';
const row = (id:string, fields: Record<string, unknown>) => ({
  id,transactionNumber:id,transactionAt:new Date('2026-10-20T05:00:00Z'),
  customer:{fullName:'Example'}, transactionType:'CASH_TRANSFER',grossAmount:10000,
  commissions:[],charges:[],quickCashTransfer:null,...fields,
});
describe('income breakdown endpoint',()=>{
  it('reconciles cards, payout charges, GPay and outsourced services without double counting',async()=>{
    const rows=[
      row('gpay',{commissions:[{amount:60,commissionType:'CUSTOMER'}],
        quickCashTransfer:{direction:'IN',purpose:'TRANSFER',serviceName:'GPay Transfer',cashOutType:'UPI_QR',beneficiaryMode:'UPI',servicePartnerCharge:0}}),
      row('card',{transactionType:'CARD_SWIPE',grossAmount:10000,
        commissions:[{amount:230,commissionType:'CARD_SWIPE'}],
        charges:[{amount:158,chargeType:'PROVIDER'}]}),
      row('payout',{transactionType:'CUSTOMER_PAYOUT',
        charges:[{amount:7,chargeType:'PAYOUT'}],
        payablePayment:{payable:{sourceTransaction:{transactionType:'CARD_SWIPE',
          transactionNumber:'CCS-001'}}}}),
      row('pan',{transactionType:'SERVICE_INCOME',grossAmount:250,
        charges:[{amount:150,chargeType:'SERVICE_PARTNER_COST'}],
        quickCashTransfer:{direction:'IN',purpose:'SERVICE',serviceName:'PAN Card',cashOutType:'UPI_QR',beneficiaryMode:null,servicePartnerCharge:150}}),
      row('move',{transactionType:'INTERNAL_TRANSFER',grossAmount:20000}),
    ];
    const findMany=vi.fn().mockImplementation(async(args: {where?:{id?:unknown}}) =>
      args.where?.id ? [] : rows);
    const db={
      transaction:{findMany,count:vi.fn().mockResolvedValue(5),
        aggregate:vi.fn().mockResolvedValue({_sum:{grossAmount:250}})},
      transactionCommission:{aggregate:vi.fn().mockImplementation(({where})=>({
        _sum:{amount:where.commissionType?0:290},
      }))},
      transactionCharge:{groupBy:vi.fn().mockResolvedValue([
        {chargeType:'PROVIDER',_sum:{amount:158}},
        {chargeType:'PAYOUT',_sum:{amount:7}},
      ])},
      quickCashTransferDetail:{
        aggregate:vi.fn().mockResolvedValue({_sum:{servicePartnerCharge:150}}),
        findMany:vi.fn().mockResolvedValue([]),
      },
    };
    const service=new TransactionsService(db as never,
      null as never,null as never,null as never,null as never,null as never);
    const result=await service.incomeBreakdown({from:new Date('2026-10-20T00:00:00Z')});
    expect(result.summary).toEqual({
      customerCommission:290,providerIncome:0,serviceRevenue:250,totalIncome:540,
      providerCost:158,payoutCost:7,partnerCost:150,netIncome:225,
    });
    expect(result.transactionCount).toBe(5);
    expect(result.reconciliation).toMatchObject({balanced:true,independentIncome:540,
      independentCosts:315,independentNetIncome:225,transactionCount:5});
    expect(result.categories.map(group=>group.category)).toContain('GPay Transfer');
    expect(result.categories.map(group=>group.category)).toContain('Card Swipe');
    expect(result.categories.find(group=>group.category==='Card Swipe')?.totals.netIncome).toBe(65);
    expect(result.categories.find(group=>group.category==='Card Swipe')?.examples
      .some(entry=>entry.attribution==='Payout fee linked to CCS-001')).toBe(true);
    expect(result.categories.map(group=>group.category)).toContain('Service · PAN Card');
    expect(result.categories.map(group=>group.category)).not.toContain('Internal Transfer');
    expect(result.categories.find(group=>group.category==='Service · PAN Card')?.totals.netIncome).toBe(100);
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      NOT:{transactionNumber:{startsWith:'QCC-'}},
      transactionType:{not:'REVERSAL'},
    });
  });
});

describe('income history paging and QCC fees',()=>{
  const transfer=(id:string,extra:Record<string,unknown>={})=>({
    id,transactionNumber:id,transactionAt:new Date('2026-10-20T07:00:00Z'),
    customer:null,transactionType:'CASH_TRANSFER',grossAmount:1000,
    commissions:[{amount:20,commissionType:'QUICK_CASH_TRANSFER'}],charges:[],
    quickCashTransfer:{direction:'IN',purpose:'TRANSFER',cashOutType:'UPI_QR',serviceName:'GPay Transfer',
      beneficiaryMode:'UPI',servicePartnerCharge:0,completionTransactionId:null},
    payablePayment:null,customerLedgerEntry:null,...extra,
  });
  it('includes hidden QCC fees on the original transfer and pages all 27 contributing records',async()=>{
    const rows=Array.from({length:27},(_,i)=>transfer('QCT-'+String(i+1).padStart(2,'0'),
      i===0?{quickCashTransfer:{...transfer('x').quickCashTransfer,completionTransactionId:'qcc-1'}}:{}));
    const findMany=vi.fn().mockImplementation(async(args:{where?:{id?:{in:string[]}}})=>
      args.where?.id?.in?[{id:'qcc-1',charges:[{amount:8,chargeType:'PAYOUT'}]}]:rows);
    const db={
      transaction:{findMany,count:vi.fn().mockResolvedValue(27),
        aggregate:vi.fn().mockResolvedValue({_sum:{grossAmount:0}})},
      transactionCommission:{aggregate:vi.fn().mockImplementation(({where})=>({
        _sum:{amount:where.commissionType?0:540},
      }))},
      transactionCharge:{groupBy:vi.fn().mockImplementation(({where})=>
        where.transactionId?[{chargeType:'PAYOUT',_sum:{amount:8}}]:[])},
      quickCashTransferDetail:{
        aggregate:vi.fn().mockResolvedValue({_sum:{servicePartnerCharge:0}}),
        findMany:vi.fn().mockResolvedValue([{completionTransactionId:'qcc-1'}]),
      },
    };
    const service=new TransactionsService(db as never,
      null as never,null as never,null as never,null as never,null as never);
    const full=await service.incomeBreakdown({detailCategory:'GPay Transfer',detailPage:2});
    expect(full.summary).toMatchObject({totalIncome:540,payoutCost:8,netIncome:532});
    expect(full.reconciliation).toMatchObject({balanced:true,independentNetIncome:532,
      quickCompletionCount:1});
    const group=full.categories.find(g=>g.category==='GPay Transfer');
    expect(group?.count).toBe(27);
    expect(group?.examples).toHaveLength(2);
    expect(full.detailPage).toBe(2);
    const first=await service.incomeBreakdown({detailCategory:'GPay Transfer',detailPage:1});
    expect(first.categories.find(g=>g.category==='GPay Transfer')?.examples).toHaveLength(25);
  });
});
