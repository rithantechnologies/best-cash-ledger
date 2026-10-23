import { describe, expect, it, vi } from 'vitest';
import { Prisma, PayableStatus, PaymentStatus, TransactionStatus } from '@prisma/client';
import { PayablesService } from './payables.service.js';

const dec = (amount: number) => new Prisma.Decimal(amount);
function payable(storedRemaining: number, status: PayableStatus) {
  return {
    id: 'payable-1', customerId: 'customer-1', customer: {fullName:'Manikandan',mobile:null},
    sourceTransaction: {transactionNumber:'CCS-1',transactionAt:new Date('2026-10-19T09:39:06Z'),status:TransactionStatus.COMPLETED,cardSwipe:{customerPayableAmount:dec(29000),customerCardId:'card-1'}},
    originalAmount: dec(29000), paidAmount: dec(29000), offsetAmount: dec(0),
    remainingAmount: dec(storedRemaining), status,
    payments: [{amount:dec(29000),status:PaymentStatus.COMPLETED,transaction:{status:TransactionStatus.COMPLETED}}],
    advanceOffsets: [], manualLedgerAllocations: [],
  };
}
describe('payout status vs actual payments', () => {
  it('flags a completed payout incorrectly displayed as unpaid without altering balances', async () => {
    const findMany=vi.fn().mockResolvedValue([payable(29000,PayableStatus.PENDING)]);
    const service=new PayablesService({customerPayable:{findMany},customerLedgerEntryDetail:{findMany:vi.fn().mockResolvedValue([])}} as never,{} as never,{} as never,{} as never,{} as never);
    const report=await service.reconciliation();
    expect(report.issueCount).toBe(1);
    expect(report.issues[0]).toMatchObject({customer:'Manikandan',expectedRemainingAmount:0,storedRemainingAmount:29000});
    expect(report.issues[0].reasons).toContain('Remaining amount differs from original minus settlements');
  });
  it('flags a zeroed payable when the original card swipe still shows money owed', async () => {
    const p=payable(0,PayableStatus.PAID);
    p.originalAmount=dec(0);p.paidAmount=dec(0);p.payments=[];
    const service=new PayablesService({customerPayable:{findMany:vi.fn().mockResolvedValue([p])},customerLedgerEntryDetail:{findMany:vi.fn().mockResolvedValue([])}} as never,{} as never,{} as never,{} as never,{} as never);
    const report=await service.reconciliation();
    expect(report.issueCount).toBe(1);
    expect(report.issues[0].reasons.join(' ')).toContain('manual zeroing');
  });
  it('flags the Manikandan prior Pay Out advance without posting any second payout', async () => {
    const p=payable(29000,PayableStatus.OVERDUE);
    p.paidAmount=dec(0);p.payments=[];
    const earlier={
      id:'advance-1',customerCardId:'card-1',
      amount:dec(29008),receivableAmount:dec(29000),payableAmount:dec(0),advanceAppliedAmount:dec(0),
      transaction:{customerId:'customer-1',transactionAt:new Date('2026-10-19T09:37:00Z'),transactionNumber:'CLK-MVF28Q2A'},
    };
    const findMany=vi.fn().mockResolvedValue([earlier]);
    const service=new PayablesService({
      customerPayable:{findMany:vi.fn().mockResolvedValue([p])},
      customerLedgerEntryDetail:{findMany},
    } as never,{} as never,{} as never,{} as never,{} as never);
    const report=await service.reconciliation();
    expect(report.issueCount).toBe(1);
    expect(report.issues[0].reasons.join(' ')).toContain('Apply earlier Pay Out');
    expect(report.issues[0].reasons.join(' ')).toContain('₹8.00');
    expect(findMany).toHaveBeenCalledTimes(1);
  });
  it('reports no discrepancy when the payable and active payments reconcile', async () => {
    const findMany=vi.fn().mockResolvedValue([payable(0,PayableStatus.PAID)]);
    const service=new PayablesService({customerPayable:{findMany},customerLedgerEntryDetail:{findMany:vi.fn().mockResolvedValue([])}} as never,{} as never,{} as never,{} as never,{} as never);
    expect((await service.reconciliation()).issueCount).toBe(0);
  });
});
