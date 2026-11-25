import {test} from 'node:test';
import assert from 'node:assert/strict';
import {todayIst,transactionAtForBusinessDate} from '../src/lib/card-swipe-today-ist.mjs';
test('transaction business date defaults to today IST regardless of browser location',()=>{
 const now=new Date('2026-11-25T19:05:11Z');
 assert.equal(todayIst(now),'2026-11-26');
 assert.equal(transactionAtForBusinessDate(todayIst(now),now),undefined);
});
test('historical business date keeps original day and current IST time without overwriting creation timestamps',()=>{
 const now=new Date('2026-11-25T09:30:00Z');
 assert.equal(transactionAtForBusinessDate('2026-11-24',now),'2026-11-24T09:30:00.000Z');
 assert.throws(()=>transactionAtForBusinessDate('2026-11-27',now));
});
