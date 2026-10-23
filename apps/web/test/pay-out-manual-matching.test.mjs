import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { allocatePayOutOldestFirst, defaultPayOutSelection, payOutAllocationsForChoice } from "../src/lib/pay-out-allocation.mjs";

const payables=[
 {targetId:"older-swipe",remainingAmount:9620},
 {targetId:"intended-swipe",remainingAmount:45300},
];

test("default Pay Out never silently matches an older swipe",()=>{
 assert.deepEqual(payOutAllocationsForChoice(payables,39280,""),{});
 assert.deepEqual(payOutAllocationsForChoice(payables,39280,"UNALLOCATED"),{});
});

test("a lone linked swipe is prefilled, but two open swipes never choose an arbitrary first",()=>{
 assert.deepEqual(defaultPayOutSelection([{targetId:"only-swipe",remainingAmount:48900}],39280),
  {choice:"only-swipe",allocations:{"only-swipe":"39280"}});
 assert.deepEqual(defaultPayOutSelection(payables,39280),
  {choice:"",allocations:{}});
 assert.deepEqual(defaultPayOutSelection([],39280),
  {choice:"",allocations:{}});
});

test("explicit selected swipe receives the complete second 39,280 payout",()=>{
 assert.deepEqual(payOutAllocationsForChoice(payables,39280,"intended-swipe"),{"intended-swipe":"39280"});
 assert.deepEqual(payOutAllocationsForChoice(payables,39000,"intended-swipe"),{"intended-swipe":"39000"});
 assert.deepEqual(payOutAllocationsForChoice(payables,48000,"intended-swipe"),{"intended-swipe":"45300"});
 assert.deepEqual(payOutAllocationsForChoice(payables,39280,"unknown"),{});
});

test("Pay Out refuses legacy auto matching, so 39,280 cannot silently spill into other swipes",()=>{
 assert.deepEqual(payOutAllocationsForChoice(payables,39280,"AUTO"),{});
});

test("manual split amounts survive amount changes without an unrequested rewrite",()=>{
 const entered={"older-swipe":"3000","intended-swipe":"35000"};
 assert.deepEqual(payOutAllocationsForChoice(payables,39280,"SPLIT",entered),entered);
 assert.deepEqual(payOutAllocationsForChoice(payables,40000,"SPLIT",entered),entered);
});

test("one bank payout can explicitly allocate across three swipes, oldest first",()=>{
 const swipes=[
  {targetId:"swipe-1",remainingAmount:24424},
  {targetId:"swipe-2",remainingAmount:24424},
  {targetId:"swipe-3",remainingAmount:20519},
 ];
 assert.deepEqual(allocatePayOutOldestFirst(swipes,69367),{
  "swipe-1":"24424","swipe-2":"24424","swipe-3":"20519",
 });
 assert.deepEqual(allocatePayOutOldestFirst(swipes,25000),{
  "swipe-1":"24424","swipe-2":"576",
 });
 assert.deepEqual(allocatePayOutOldestFirst(swipes,70000),{
  "swipe-1":"24424","swipe-2":"24424","swipe-3":"20519",
 });
 assert.deepEqual(allocatePayOutOldestFirst(swipes,0),{});
 assert.deepEqual(allocatePayOutOldestFirst(swipes,"not a number"),{});
 assert.deepEqual(allocatePayOutOldestFirst([{targetId:"a",remainingAmount:2.35},{targetId:"b",remainingAmount:1.10}],3.11),{a:"2.35",b:"0.76"});
});

test("customer form requires explicit matching, validates unallocated remainder, and leaves Pay In logic alone",()=>{
 const page=readFileSync(join(dirname(fileURLToPath(import.meta.url)),"../src/app/customers/[id]/page.tsx"),"utf8");
 assert.match(page,/defaultPayOutSelection\(eligiblePayables,nextAmount\)/);
 assert.match(page,/direction==="PAY_OUT"\?defaultMatch.allocations/);
 assert.match(page,/direction==="PAY_IN"&&nextAmount\?suggestedLedgerAllocations/);
 assert.match(page,/ledgerEntryDirection==="PAY_OUT"\?payOutAllocationsForChoice/);
 assert.match(page,/!ledgerPayOutMatchChoice/);
 assert.match(page,/amount-matched>\.001&&!ledgerUnallocatedConfirmed/);
 assert.doesNotMatch(page,/<option value="AUTO">/);
 assert.doesNotMatch(page,/setLedgerPayOutMatchChoice\("AUTO"\)/);
 assert.match(page,/>Split manually<\/button>/);
 assert.match(page,/allocatePayOutOldestFirst\(ledgerMatchItems,ledgerEntryAmount\)/);
 assert.match(page,/Apply one payout to multiple swipes/);
 assert.match(page,/eligiblePayables.length===1\?String\(nextPayable.remainingAmount\):""/);
 assert.match(page,/const nextCardId=ledgerCardId\|\|\(eligiblePayables.length===1/);
 assert.match(page,/Choose the exact swipe/);
});
