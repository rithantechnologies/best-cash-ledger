import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { payOutAllocationsForChoice } from "../src/lib/pay-out-allocation.mjs";

const payables=[
 {targetId:"older-swipe",remainingAmount:9620},
 {targetId:"intended-swipe",remainingAmount:45300},
];

test("default Pay Out never silently matches an older swipe",()=>{
 assert.deepEqual(payOutAllocationsForChoice(payables,39280,""),{});
 assert.deepEqual(payOutAllocationsForChoice(payables,39280,"UNALLOCATED"),{});
});

test("explicit selected swipe receives the complete second 39,280 payout",()=>{
 assert.deepEqual(payOutAllocationsForChoice(payables,39280,"intended-swipe"),{"intended-swipe":"39280"});
 assert.deepEqual(payOutAllocationsForChoice(payables,39000,"intended-swipe"),{"intended-swipe":"39000"});
 assert.deepEqual(payOutAllocationsForChoice(payables,48000,"intended-swipe"),{"intended-swipe":"45300"});
 assert.deepEqual(payOutAllocationsForChoice(payables,39280,"unknown"),{});
});

test("only explicit Auto oldest first splits 39,280 into 9,620 and 29,660",()=>{
 assert.deepEqual(payOutAllocationsForChoice(payables,39280,"AUTO"),{"older-swipe":"9620","intended-swipe":"29660"});
});

test("manual split amounts survive amount changes without an unrequested rewrite",()=>{
 const entered={"older-swipe":"3000","intended-swipe":"35000"};
 assert.deepEqual(payOutAllocationsForChoice(payables,39280,"SPLIT",entered),entered);
 assert.deepEqual(payOutAllocationsForChoice(payables,40000,"SPLIT",entered),entered);
});

test("customer form requires explicit matching, validates unallocated remainder, and leaves Pay In logic alone",()=>{
 const page=readFileSync(join(dirname(fileURLToPath(import.meta.url)),"../src/app/customers/[id]/page.tsx"),"utf8");
 assert.match(page,/direction==="PAY_IN"&&nextAmount\?suggestedLedgerAllocations/);
 assert.match(page,/ledgerEntryDirection==="PAY_OUT"\?payOutAllocationsForChoice/);
 assert.match(page,/ledgerEntryDirection==="PAY_OUT"\?\{\}:suggestedLedgerAllocations/);
 assert.match(page,/!ledgerPayOutMatchChoice/);
 assert.match(page,/amount-matched>\.001&&!ledgerUnallocatedConfirmed/);
 assert.match(page,/setLedgerPayOutMatchChoice\("AUTO"\)/);
 assert.match(page,/Choose the exact swipe/);
});
