import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { FollowUpsService } from './follow-ups.service.js';

const customerId = 'a0000000-0000-4000-8000-000000000001';
const accountId = 'a0000000-0000-4000-8000-000000000002';
const task = {
 id: 'a0000000-0000-4000-8000-000000000003',
 kind: 'BANK_REFUND', status: 'OPEN', customerId, accountId,
 expectedAmount: 1000, nextReminderAt: new Date('2026-11-25T02:30:00Z'),
 receiptTransactionId: null, notes: null,
};

function makeTx(credited: number, status = 'COMPLETED') {
 const update = vi.fn().mockResolvedValue({
  ...task, status: 'COMPLETED', receiptTransactionId: 'posted-credit',
  nextReminderAt: null,
 });
 const tx = {
  followUpTask: {
   findUnique: vi.fn().mockResolvedValue(task),
   findFirst: vi.fn().mockResolvedValue(null),
   update,
  },
  transaction: { findUnique: vi.fn().mockResolvedValue({
   id: 'posted-credit', status, journal: {
    status: 'POSTED',
    entries: [{
     entryType: 'DEBIT', amount: credited,
     ledgerAccount: { financialAccountId: accountId },
    }],
   },
  }) },
  followUpEvent: { create: vi.fn().mockResolvedValue({}) },
  auditLog: { create: vi.fn().mockResolvedValue({}) },
 };
 const prisma = { $transaction: async (callback: (tx: typeof tx) => Promise<unknown>) => callback(tx) };
 return {service: new FollowUpsService(prisma as never),tx,update};
}

describe('expected bank refund accounting safeguards', () => {
 it('does not mark an expected refund received without a real posted credit', async () => {
  const { service, tx, update } = makeTx(600);
  await expect(service.update(task.id,{
   action: 'VERIFY_REFUND', receiptTransactionNumber: 'TX-123',
  },customerId)).rejects.toBeInstanceOf(BadRequestException);
  expect(update).not.toHaveBeenCalled();
  expect(tx.followUpEvent.create).not.toHaveBeenCalled();
 });
 it('rejects a reversed refund receipt even when its journal was posted', async () => {
  const {service, update} = makeTx(1000,'REVERSED');
  await expect(service.update(task.id,{
   action: 'VERIFY_REFUND', receiptTransactionNumber: 'TX-123',
  },customerId)).rejects.toBeInstanceOf(BadRequestException);
  expect(update).not.toHaveBeenCalled();
 });
 it('links an independently posted account credit without making ledger entries', async () => {
  const {service,tx,update} = makeTx(1000);
  const result=await service.update(task.id,{
   action: 'VERIFY_REFUND', receiptTransactionNumber: 'TX-123',
  },customerId);
  expect(result.status).toBe('COMPLETED');
  expect(update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({
   status:'COMPLETED',receiptTransaction:{connect:{id:'posted-credit'}},
  })}));
  expect(tx.followUpEvent.create).toHaveBeenCalledOnce();
  expect(tx.auditLog.create).toHaveBeenCalledOnce();
  // Only task/audit models are available in the transaction double.
  expect(Object.keys(tx).sort()).toEqual(['auditLog','followUpEvent','followUpTask','transaction']);
 });
 it('never allows an unverified bank refund to be marked complete', async () => {
  const {service, update}=makeTx(1000);
  await expect(service.update(task.id,{action:'COMPLETE'},customerId))
    .rejects.toBeInstanceOf(BadRequestException);
  expect(update).not.toHaveBeenCalled();
 });
});
