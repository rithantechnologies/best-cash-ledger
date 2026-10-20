import { describe, expect, it } from 'vitest';
import { transactionIncome } from './transaction-income.js';
const row = (values: Record<string, unknown> = {}) => ({
  id:'tx-1', transactionNumber:'TEST-001',transactionType:'CASH_TRANSFER',
  transactionAt:'2026-10-20T05:00:00.000Z',grossAmount:10000,
  charges:[],commissions:[],...values,
});
describe('read-only net income breakdown', () => {
  it('counts only commission, not customer transfer principal', () => {
    const result = transactionIncome(row({commissions:[{amount:60,commissionType:'CUSTOMER'}],
      quickCashTransfer:{direction:'IN',purpose:'TRANSFER',serviceName:'GPay Transfer',beneficiaryMode:'UPI',cashOutType:'UPI_QR',servicePartnerCharge:0}}));
    expect(result.category).toBe('GPay Transfer');
    expect(result.amounts).toMatchObject({totalIncome:60,netIncome:60,serviceRevenue:0});
  });
  it('counts gateway and payout charges against card income, including costs on separate payouts', () => {
    const swipe = transactionIncome(row({transactionType:'CARD_SWIPE',
      commissions:[{amount:230,commissionType:'CARD_SWIPE'}],
      charges:[{amount:158,chargeType:'PROVIDER'},{amount:7,chargeType:'PAYOUT'}]}));
    expect(swipe.amounts).toMatchObject({totalIncome:230,providerCost:158,payoutCost:7,netIncome:65});
    const payout = transactionIncome(row({transactionType:'CUSTOMER_PAYOUT',
      charges:[{amount:7,chargeType:'PAYOUT'}]}));
    expect(payout.amounts.netIncome).toBe(-7);
  });
  it('subtracts outsourced service partner cost only once', () => {
    const service = transactionIncome(row({transactionType:'SERVICE_INCOME',grossAmount:250,
      charges:[{amount:150,chargeType:'SERVICE_PARTNER_COST'}],
      quickCashTransfer:{purpose:'SERVICE',serviceName:'PAN Card',direction:'IN',cashOutType:'UPI_QR',beneficiaryMode:null,servicePartnerCharge:150}}));
    expect(service.amounts).toMatchObject({serviceRevenue:250,totalIncome:250,partnerCost:150,providerCost:0,netIncome:100});
  });
  it('subtracts all recorded provider charges while preserving internal transfers without fees', () => {
    const transfer = transactionIncome(row({transactionType:'INTERNAL_TRANSFER'}));
    expect(transfer.amounts.netIncome).toBe(0);
    const aeps = transactionIncome(row({quickCashTransfer:{direction:'OUT',purpose:'TRANSFER',
      cashOutType:'AEPS',serviceName:null,beneficiaryMode:null,servicePartnerCharge:0},
      commissions:[{amount:40,commissionType:'AEPS_CUSTOMER'}],charges:[{amount:12,chargeType:'PROVIDER'}]}));
    expect(aeps.category).toBe('AEPS Withdrawal');
    expect(aeps.amounts.netIncome).toBe(28);
  });
});
