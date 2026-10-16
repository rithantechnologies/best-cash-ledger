import test from "node:test";
import assert from "node:assert/strict";
import { accountLedgerDateQuery, isDeletedOrReversedLedgerMovement } from "../src/lib/account-ledger-filters.ts";

const fromTo = (range, from = "2026-10-10", to = "2026-10-16", now = new Date("2026-10-16T12:00:00+05:30")) =>
  new URLSearchParams(accountLedgerDateQuery(range, from, to, now));

test("Today and Yesterday use full local-day start/end bounds", () => {
  const today = fromTo("today");
  assert.equal(today.get("from"), new Date("2026-10-16T00:00:00").toISOString());
  assert.equal(today.get("to"), new Date("2026-10-16T23:59:59.999").toISOString());
  const yesterday = fromTo("yesterday");
  assert.equal(yesterday.get("from"), new Date("2026-10-15T00:00:00").toISOString());
  assert.equal(yesterday.get("to"), new Date("2026-10-15T23:59:59.999").toISOString());
});

test("Existing date presets preserve seven, thirty and ninety day start windows", () => {
  for (const [range, first] of [["7d", "2026-10-10"], ["30d", "2026-09-17"], ["90d", "2026-07-19"]]) {
    const query=fromTo(range);
    assert.equal(query.get("from"), new Date(first+"T00:00:00").toISOString());
    assert.equal(query.has("to"), false);
  }
});

test("Custom periods include their final day's final millisecond", () => {
  const query=fromTo("custom", "2026-10-01", "2026-10-05");
  assert.equal(query.get("from"), new Date("2026-10-01T00:00:00").toISOString());
  assert.equal(query.get("to"), new Date("2026-10-05T23:59:59.999").toISOString());
  assert.equal(accountLedgerDateQuery("custom", "2026-10-18", "2026-10-05"),null);
  assert.equal(accountLedgerDateQuery("custom", "2026-02-30", "2026-03-01"),null);
  assert.equal(accountLedgerDateQuery("custom", "", "2026-03-01"),null);
  assert.equal(accountLedgerDateQuery("all", "", ""), "");
});

test("Reversed, cancelled and reversing entries default to hidden; normal posted movements remain visible", () => {
  for (const tx of [
    {status:"REVERSED",transactionType:"EXPENSE"},
    {status:"CANCELLED",transactionType:"CASH_TRANSFER"},
    {status:"COMPLETED",transactionType:"REVERSAL"},
  ]) assert.equal(isDeletedOrReversedLedgerMovement(tx),true);
  for (const tx of [
    {status:"COMPLETED",transactionType:"CASH_TRANSFER"},
    {status:"PENDING",transactionType:"CARD_SWIPE"},
  ]) assert.equal(isDeletedOrReversedLedgerMovement(tx),false);
});
