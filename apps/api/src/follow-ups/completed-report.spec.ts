import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { FollowUpsService } from './follow-ups.service.js';
import { completedReportBounds } from './completed-report-date.js';

describe('IST completed follow-up reporting', () => {
 it('includes the entire last report day and excludes next IST midnight', () => {
  const range=completedReportBounds('2026-11-24','2026-11-25');
  expect(range.gte.toISOString()).toBe('2026-11-23T18:30:00.000Z');
  expect(range.lt.toISOString()).toBe('2026-11-25T18:30:00.000Z');
 });
 it('rejects invalid and oversized ranges', () => {
  for(const [from,to] of [['2026-02-30','2026-03-01'],['2026-11-26','2026-11-25'],['2024-01-01','2026-11-25']]) {
   expect(()=>completedReportBounds(from,to)).toThrow(BadRequestException);
  }
 });
 it('uses completion date, resolves staff names and includes completion note', async () => {
  const task={id:'task',kind:'CARD_RETRY',status:'COMPLETED',plannedSwipeAmount:60000,
   expectedAmount:null,completedById:'staff',createdAt:new Date('2026-11-24T07:00:00Z'),
   completedAt:new Date('2026-11-25T09:30:00Z'),customer:{fullName:'Customer',mobile:'9876543210'},
   card:{bankName:'SBI',lastFourDigits:'5335'},provider:{name:'EASYPAY'},gateway:{gatewayName:'PG1'},
   account:null,reason:'Retry',reference:null,events:[{note:'Retried successfully'}],
   swipeAllocations:[{amount:60000,transaction:{status:'COMPLETED'}}],
   receiptTransaction:null};
  const db={followUpTask:{findMany:vi.fn().mockResolvedValue([task])},
   user:{findMany:vi.fn().mockResolvedValue([{id:'staff',fullName:'Cashier'}])}};
  const result=await new FollowUpsService(db as never).completedReport('2026-11-25','2026-11-25');
  expect(db.followUpTask.findMany.mock.calls[0][0].where).toMatchObject({status:'COMPLETED'});
  expect(result).toMatchObject({total:1,cardRetries:1,rows:[{
   customer:'Customer',completedBy:'Cashier',completionNote:'Retried successfully',
   plannedAmount:60000,swipedAmount:60000,
  }]});
  expect(db.followUpTask.findMany.mock.calls[0][0].take).toBe(10001);
 });
 it('refuses silently truncated reports',async()=>{
  const db={followUpTask:{findMany:vi.fn().mockResolvedValue(Array.from({length:10001},()=>({})))},
   user:{findMany:vi.fn()}};
  await expect(new FollowUpsService(db as never).completedReport('2026-11-25','2026-11-25'))
   .rejects.toBeInstanceOf(BadRequestException);
  expect(db.user.findMany).not.toHaveBeenCalled();
 });
});
