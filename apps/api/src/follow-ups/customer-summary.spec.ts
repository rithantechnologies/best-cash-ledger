import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { FollowUpsService } from './follow-ups.service.js';

const customer = 'a0000000-0000-4000-8000-000000000001';
const firstCard = 'a0000000-0000-4000-8000-000000000002';
const secondCard = 'a0000000-0000-4000-8000-000000000003';
const task = 'a0000000-0000-4000-8000-000000000004';

describe('customer-wise pending card summary', () => {
  it('counts distinct saved cards and shows only confirmed planned amounts', async () => {
    const groupBy = vi.fn()
      .mockResolvedValueOnce([
        { customerId: customer, _count: { _all: 3, plannedSwipeAmount: 1 },
          _sum: { plannedSwipeAmount: 60000 }, _min: { nextReminderAt: new Date('2026-11-25T02:30:00Z') } },
      ])
      .mockResolvedValueOnce([{ customerId: customer, _count: { _all: 2 } }]);
    const db = {
      followUpTask: {
        groupBy,
        findMany: vi.fn().mockResolvedValue([
          {customerId: customer, cardId: firstCard},
          {customerId: customer, cardId: secondCard},
        ]),
      },
      customer: { findMany: vi.fn().mockResolvedValue([
        {id: customer, fullName:'DEIVASIGAMANI', mobile:'9990001112'},
      ]) },
    };
    const result = await new FollowUpsService(db as never).customerSummary();
    expect(result).toMatchObject([{
      customerId: customer, customerName: 'DEIVASIGAMANI',
      cardCount: 2, taskCount: 3, amountCount: 1, amountMissing: 2,
      plannedSwipeTotal: 60000, dueCount: 2,
    }]);
    expect(groupBy.mock.calls[0][0].where).toMatchObject({
      kind: 'CARD_RETRY', status: 'OPEN',
    });
    expect(db.followUpTask.findMany.mock.calls[0][0]).toMatchObject({
      distinct: ['customerId','cardId'],
    });
  });

  it('audits an amount correction and never creates a financial transaction', async () => {
    const old = {id:task,kind:'CARD_RETRY',status:'OPEN',
      plannedSwipeAmount:null,nextReminderAt:new Date('2026-11-25T02:30:00Z'),
      receiptTransactionId:null,notes:null};
    const update = vi.fn().mockResolvedValue({...old,plannedSwipeAmount:160000});
    const tx = {
      followUpTask:{findUnique:vi.fn().mockResolvedValue(old),update},
      followUpEvent:{create:vi.fn().mockResolvedValue({})},
      auditLog:{create:vi.fn().mockResolvedValue({})},
    };
    const service = new FollowUpsService({
      $transaction: async (fn: (value: typeof tx)=>Promise<unknown>)=>fn(tx),
    } as never);
    await service.update(task,{action:'SET_AMOUNT',plannedSwipeAmount:160000},customer);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data:expect.objectContaining({plannedSwipeAmount:160000}),
    }));
    expect(tx.followUpEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data:expect.objectContaining({
        action:'SET_AMOUNT',
        oldValues:expect.objectContaining({plannedSwipeAmount:null}),
        newValues:expect.objectContaining({plannedSwipeAmount:'160000'}),
      }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
    expect(Object.keys(tx).sort()).toEqual(['auditLog','followUpEvent','followUpTask']);
  });

  it('rejects zero/negative and refund misuse of planned card amount', async () => {
    const row = {id:task,kind:'BANK_REFUND',status:'OPEN',plannedSwipeAmount:null};
    const tx = {
      followUpTask:{findUnique:vi.fn().mockResolvedValue(row),update:vi.fn()},
      followUpEvent:{create:vi.fn()},
      auditLog:{create:vi.fn()},
    };
    const service = new FollowUpsService({
      $transaction: async (fn: (value: typeof tx)=>Promise<unknown>)=>fn(tx),
    } as never);
    await expect(service.update(task,{action:'SET_AMOUNT',plannedSwipeAmount:100},customer))
      .rejects.toBeInstanceOf(BadRequestException);
    tx.followUpTask.findUnique.mockResolvedValue({...row,kind:'CARD_RETRY'});
    await expect(service.update(task,{action:'SET_AMOUNT',plannedSwipeAmount:-1},customer))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.followUpTask.update).not.toHaveBeenCalled();
  });
});
