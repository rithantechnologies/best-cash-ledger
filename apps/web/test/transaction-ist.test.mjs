import {test} from "node:test";
import assert from "node:assert/strict";
import { formatTransactionTimeIst,formatTransactionDateIst,formatTransactionDayIst,transactionRangeIst,transactionTimestampToInputIst,transactionInputIstToIso }
  from "../src/lib/transaction-ist.mjs";

test("timestamps display unambiguous 12-hour time, including India date boundary",()=>{
 const stamp="2026-11-25T15:58:00.000Z";
 assert.equal(formatTransactionTimeIst(stamp),"09:28 PM IST");
 assert.equal(formatTransactionDateIst(stamp),"25 Nov 2026, 09:28 PM IST");
 assert.equal(formatTransactionDayIst(stamp),"25 Nov 2026");
 assert.equal(formatTransactionTimeIst("2026-11-25T18:30:00.000Z"),"12:00 AM IST");
 assert.equal(formatTransactionDateIst("2026-11-25T18:30:00.000Z"),"26 Nov 2026, 12:00 AM IST");
});
test("Today, Yesterday and last seven days use actual IST midnight",()=>{
 const now=new Date("2026-11-25T19:00:00.000Z"); // 26 Nov 00:30 IST
 assert.deepEqual(transactionRangeIst("today",now),{
  from:"2026-11-25T18:30:00.000Z",to:"2026-11-26T18:29:59.999Z",
 });
 assert.deepEqual(transactionRangeIst("yesterday",now),{
  from:"2026-11-24T18:30:00.000Z",to:"2026-11-25T18:29:59.999Z",
 });
 assert.equal(transactionRangeIst("week",now).from,"2026-11-19T18:30:00.000Z");
 assert.equal(transactionRangeIst("all",now),null);
});
test("invalid timestamp cannot masquerade as valid time",()=>{
 assert.equal(formatTransactionDateIst("not a timestamp"),"—");
});


test("owner date correction editor uses IST regardless of the operator device timezone",()=>{
 assert.equal(transactionTimestampToInputIst("2026-11-25T15:58:00.000Z"),"2026-11-25T21:28");
 assert.equal(transactionInputIstToIso("2026-11-25T21:28"),"2026-11-25T15:58:00.000Z");
 assert.throws(()=>transactionInputIstToIso("2026-02-30T09:28"));
});
