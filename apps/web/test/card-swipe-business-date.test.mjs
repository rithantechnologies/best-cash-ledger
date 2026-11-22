import { test } from "node:test";
import assert from "node:assert/strict";
import { istSwipeNow, selectedSwipeTransactionAt } from "../src/lib/card-swipe-business-date.mjs";

test("IST business date is independent of browser/system timezone", () => {
  assert.deepEqual(istSwipeNow(new Date("2026-11-19T20:20:00Z")), {date:"2026-11-20",time:"01:50"});
});
test("earlier swipe business timestamp is persisted in UTC and is not a creation timestamp", () => {
  const now = new Date("2026-11-22T08:00:00Z");
  assert.equal(selectedSwipeTransactionAt("2026-11-19","16:54",now),"2026-11-19T11:24:00.000Z");
});
test("future and invalid date/time are rejected", () => {
  const now = new Date("2026-11-22T08:00:00Z");
  assert.equal(selectedSwipeTransactionAt("2026-11-22","18:30",now),null);
  assert.equal(selectedSwipeTransactionAt("2026-02-30","16:54",now),null);
  assert.equal(selectedSwipeTransactionAt("2026-11-19","25:99",now),null);
});
