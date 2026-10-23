import { describe, expect, it, vi } from 'vitest';
import { EntryType, Prisma, TransactionStatus } from '@prisma/client';
import { CardDueClearingService } from './card-due-clearing.service.js';
const dec=(n:number)=>new Prisma.Decimal(n);
function fixture() {
  const original = {
    id:'clearing-1', transactionId:'card-tx',
    dueAmount:dec(39894), commissionAmount:dec(0), commissionRemaining:dec(0),
    transaction:{status:TransactionStatus.PARTIALLY_PAID,customerId:'customer-1'},
  };
  const tx:any={
    $queryRawUnsafe:vi.fn().mockResolvedValue([]),
    cardDueClearingDetail:{
      findUnique:vi.fn().mockResolvedValue(original),
      update:vi.fn().mockResolvedValue({}),
    },
    ledgerAccount:{findMany:vi.fn().mockResolvedValue([
      {id:'receivable',ledgerCode:'SYS-CUST-RECEIVABLE'},
      {id:'commission',ledgerCode:'SYS-COMMISSION'},
    ])},
    transaction:{create:vi.fn().mockResolvedValue({id:'assessment-1',transactionNumber:'CDA-1'})},
    transactionCommission:{create:vi.fn().mockResolvedValue({})},
    cardDueCommissionAssessment:{create:vi.fn().mockResolvedValue({})},
    auditLog:{create:vi.fn().mockResolvedValue({})},
  };
  const ledger={post:vi.fn().mockResolvedValue({})};
  const prisma={$transaction:vi.fn(async(cb:(tx:any)=>Promise<any>)=>cb(tx))};
  const idempotency={key:vi.fn().mockResolvedValue('idempotent-assessment')};
  const service=new CardDueClearingService(prisma as never,ledger as never,{} as never,idempotency as never,{} as never);
  vi.spyOn(service,'get').mockResolvedValue({} as never);
  return {tx,prisma,ledger,service};
}
describe('assess commission without collecting cash',()=>{
  it('posts accrued income against receivable and preserves principal',async()=>{
    const f=fixture();
    await f.service.assessCommission('card-tx',{amount:1196.82,notes:'agreed 3%'},'owner-1');
    expect(f.tx.cardDueClearingDetail.update).toHaveBeenCalledWith({
      where:{id:'clearing-1'},
      data:expect.objectContaining({commissionAmount:dec(1196.82),commissionRemaining:dec(1196.82)}),
    });
    expect(f.tx.cardDueCommissionAssessment.create).toHaveBeenCalledWith({
      data:expect.objectContaining({clearingId:'clearing-1',transactionId:'assessment-1',amount:dec(1196.82)}),
    });
    expect(f.ledger.post.mock.calls[0][4]).toEqual([
      expect.objectContaining({entryType:EntryType.DEBIT,ledgerAccountId:'receivable',amount:1196.82}),
      expect.objectContaining({entryType:EntryType.CREDIT,ledgerAccountId:'commission',amount:1196.82}),
    ]);
    expect(f.tx.auditLog.create).toHaveBeenCalled();
  });
  it('rejects malformed fractional paise before any posting',async()=>{
    const f=fixture();
    await expect(f.service.assessCommission('card-tx',{amount:10.123},'owner-1')).rejects.toThrow('paise');
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });
});
