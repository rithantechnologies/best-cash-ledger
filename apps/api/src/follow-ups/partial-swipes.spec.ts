import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TransactionStatus, TransactionType, JournalStatus } from '@prisma/client';
import { FollowUpsService } from './follow-ups.service.js';

const customerId = 'a0000000-0000-4000-8000-000000000001';
const cardId = 'a0000000-0000-4000-8000-000000000002';
const taskId = 'a0000000-0000-4000-8000-000000000003';
const transactionId = 'a0000000-0000-4000-8000-000000000004';

function setup(options: {
  swipeAmount?: number; allocated?: number; planned?: number;
  swipeCustomerId?: string; swipeCardId?: string; swipeStatus?: TransactionStatus;
  priorTaskId?: string;
} = {}) {
  const row = {
    id: taskId,kind:'CARD_RETRY',status:'OPEN',customerId,cardId,
    plannedSwipeAmount:options.planned??100000,
    nextReminderAt:new Date('2026-11-25T02:30:00Z'),
    receiptTransactionId:null,notes:null,
  };
  const update=vi.fn().mockResolvedValue({...row});
  const allocationCreate=vi.fn().mockResolvedValue({id:'allocation'});
  const tx={
    followUpTask:{findUnique:vi.fn().mockResolvedValue(row),update},
    transaction:{findUnique:vi.fn().mockResolvedValue({
      id:transactionId,transactionNumber:'CCS-SAVE-001',
      status:options.swipeStatus??TransactionStatus.COMPLETED,
      transactionType:TransactionType.CARD_SWIPE,
      customerId:options.swipeCustomerId??customerId,
      cardSwipe:{customerCardId:options.swipeCardId??cardId,swipeAmount:options.swipeAmount??40000},
      journal:{status:JournalStatus.POSTED},
    })},
    followUpSwipeAllocation:{
      findUnique:vi.fn().mockResolvedValue(options.priorTaskId?{followUpId:options.priorTaskId}:null),
      aggregate:vi.fn().mockResolvedValue({_sum:{amount:options.allocated??0}}),
      create:allocationCreate,
    },
    followUpEvent:{create:vi.fn().mockResolvedValue({})},
    auditLog:{create:vi.fn().mockResolvedValue({})},
  };
  const service=new FollowUpsService({
    $transaction:async (fn:(tx:typeof tx)=>Promise<unknown>)=>fn(tx),
  } as never);
  return {service,tx,allocationCreate};
}
const dto={action:'RECORD_SWIPE' as const,swipeTransactionNumber:'CCS-SAVE-001'};

describe('partial card retry swipe attribution',()=>{
  it('links one completed posted swipe without changing financial ledgers',async()=>{
    const {service,tx,allocationCreate}=setup({swipeAmount:40000,allocated:0});
    await service.update(taskId,dto,customerId);
    expect(allocationCreate).toHaveBeenCalledWith({data:{
      followUpId:taskId,transactionId,amount:40000,linkedById:customerId,
    }});
    expect(tx.followUpEvent.create).toHaveBeenCalledOnce();
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
    expect(Object.keys(tx).sort()).toEqual([
      'auditLog','followUpEvent','followUpSwipeAllocation','followUpTask','transaction',
    ]);
  });
  it('allows multiple separate partial swipes only up to remaining planned amount',async()=>{
    const {service,allocationCreate}=setup({swipeAmount:30000,allocated:40000,planned:100000});
    await service.update(taskId,dto,customerId);
    expect(allocationCreate).toHaveBeenCalledOnce();
  });
  it('blocks over-allocation',async()=>{
    const {service,allocationCreate}=setup({swipeAmount:70000,allocated:40000});
    await expect(service.update(taskId,dto,customerId)).rejects.toBeInstanceOf(BadRequestException);
    expect(allocationCreate).not.toHaveBeenCalled();
  });
  it('rejects a swipe for another customer, card or reversed transaction',async()=>{
    for(const options of [
      {swipeCustomerId:'different'},
      {swipeCardId:'different'},
      {swipeStatus:TransactionStatus.REVERSED},
    ]){
      const {service,allocationCreate}=setup(options);
      await expect(service.update(taskId,dto,customerId)).rejects.toBeInstanceOf(BadRequestException);
      expect(allocationCreate).not.toHaveBeenCalled();
    }
  });
  it('does not link a swipe already attached elsewhere',async()=>{
    const {service,allocationCreate}=setup({priorTaskId:'another-follow-up'});
    await expect(service.update(taskId,dto,customerId)).rejects.toBeInstanceOf(ConflictException);
    expect(allocationCreate).not.toHaveBeenCalled();
  });
  it('repeat linking of same swipe to same follow-up is idempotent',async()=>{
    const {service,allocationCreate}=setup({priorTaskId:taskId,allocated:40000,swipeAmount:40000});
    await service.update(taskId,dto,customerId);
    expect(allocationCreate).not.toHaveBeenCalled();
  });
  it('cannot close a partial plan before all planned swipes are completed',async()=>{
    const {service,tx}=setup({allocated:40000,planned:100000});
    await expect(service.update(taskId,{action:'COMPLETE'},customerId)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.followUpTask.update).not.toHaveBeenCalled();
  });
  it('cannot reduce the confirmed plan below already linked completed swipes',async()=>{
    const {service,tx}=setup({allocated:40000,planned:100000});
    await expect(service.update(taskId,{action:'SET_AMOUNT',plannedSwipeAmount:30000},customerId))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.followUpTask.update).not.toHaveBeenCalled();
  });
  it('calculates progress using only unreversed completed transactions',()=>{
    const {service}=setup();
    const formatted=(service as any).format({
      kind:'CARD_RETRY',plannedSwipeAmount:100000,status:'OPEN',
      swipeAllocations:[
        {amount:40000,transaction:{status:TransactionStatus.COMPLETED}},
        {amount:20000,transaction:{status:TransactionStatus.REVERSED}},
      ],
    });
    expect(formatted.swipedAmount).toBe(40000);
    expect(formatted.remainingPlannedAmount).toBe(60000);
  });
});
