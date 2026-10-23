import { describe, expect, it, vi } from 'vitest';
import { Prisma, PayableStatus, PaymentStatus, TransactionStatus } from '@prisma/client';
import { PayablesService } from './payables.service.js';

const dec = (amount: number) => new Prisma.Decimal(amount);
function payable(storedRemaining: number, status: PayableStatus) {
  return {
    id: 'payable-1', customer: {fullName:'Manikandan',mobile:null},
    sourceTransaction: {transactionNumber:'CCS-1',status:TransactionStatus.COMPLETED},
    originalAmount: dec(29000), paidAmount: dec(29000), offsetAmount: dec(0),
    remainingAmount: dec(storedRemaining), status,
    payments: [{amount:dec(29000),status:PaymentStatus.COMPLETED,transaction:{status:TransactionStatus.COMPLETED}}],
    advanceOffsets: [], manualLedgerAllocations: [],
  };
}
describe('payout status vs actual payments', () => {
  it('flags a completed payout incorrectly displayed as unpaid without altering balances', async () => {
    const findMany=vi.fn().mockResolvedValue([payable(29000,PayableStatus.PENDING)]);
    const service=new PayablesService({customerPayable:{findMany}} as never,{} as never,{} as never,{} as never,{} as never);
    const report=await service.reconciliation();
    expect(report.issueCount).toBe(1);
    expect(report.issues[0]).toMatchObject({customer:'Manikandan',expectedRemainingAmount:0,storedRemainingAmount:29000});
    expect(report.issues[0].reasons).toContain('Remaining amount differs from original minus settlements');
  });
  it('reports no discrepancy when the payable and active payments reconcile', async () => {
    const findMany=vi.fn().mockResolvedValue([payable(0,PayableStatus.PAID)]);
    const service=new PayablesService({customerPayable:{findMany}} as never,{} as never,{} as never,{} as never,{} as never);
    expect((await service.reconciliation()).issueCount).toBe(0);
  });
});
