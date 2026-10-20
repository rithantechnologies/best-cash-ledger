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
        charges:[{amount:7,chargeType:'PAYOUT'}]}),
      row('pan',{transactionType:'SERVICE_INCOME',grossAmount:250,
        charges:[{amount:150,chargeType:'SERVICE_PARTNER_COST'}],
        quickCashTransfer:{direction:'IN',purpose:'SERVICE',serviceName:'PAN Card',cashOutType:'UPI_QR',beneficiaryMode:null,servicePartnerCharge:150}}),
      row('move',{transactionType:'INTERNAL_TRANSFER',grossAmount:20000}),
    ];
    const findMany=vi.fn().mockResolvedValue(rows);
    const service=new TransactionsService({transaction:{findMany}} as never,
      null as never,null as never,null as never,null as never,null as never);
    const result=await service.incomeBreakdown({from:new Date('2026-10-20T00:00:00Z')});
    expect(result.summary).toEqual({
      customerCommission:290,providerIncome:0,serviceRevenue:250,totalIncome:540,
      providerCost:158,payoutCost:7,partnerCost:150,netIncome:225,
    });
    expect(result.transactionCount).toBe(5);
    expect(result.categories.map(group=>group.category)).toContain('GPay Transfer');
    expect(result.categories.map(group=>group.category)).toContain('Card Swipe');
    expect(result.categories.map(group=>group.category)).toContain('Service · PAN Card');
    expect(result.categories.map(group=>group.category)).not.toContain('Internal Transfer');
    expect(result.categories.find(group=>group.category==='Service · PAN Card')?.totals.netIncome).toBe(100);
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      NOT:{transactionNumber:{startsWith:'QCC-'}},
      transactionType:{not:'REVERSAL'},
    });
  });
});
