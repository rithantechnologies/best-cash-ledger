import test from "node:test";
import assert from "node:assert/strict";
import { accountLedgerDateQuery } from "./account-ledger-filters.ts";

const localStart = (y,m,d) => new Date(y,m-1,d,0,0,0,0).toISOString();
const localEnd = (y,m,d) => new Date(y,m-1,d,23,59,59,999).toISOString();

test("Today filter includes only the selected local calendar day", () => {
  const query = accountLedgerDateQuery("today","","",new Date(2026,9,19,17,45,0));
  const params=new URLSearchParams(query);
  assert.equal(params.get("from"),localStart(2026,10,19));
  assert.equal(params.get("to"),localEnd(2026,10,19));
});

test("Yesterday stays in yesterday rather than including today", () => {
  const params=new URLSearchParams(accountLedgerDateQuery("yesterday","","",new Date(2026,9,19,13)));
  assert.equal(params.get("from"),localStart(2026,10,18));
  assert.equal(params.get("to"),localEnd(2026,10,18));
});

test("30 days remains selectable, and All time remains unfiltered", () => {
  const now=new Date(2026,9,19,13);
  const params=new URLSearchParams(accountLedgerDateQuery("30d","","",now));
  assert.equal(params.get("from"),localStart(2026,9,20));
  assert.equal(params.has("to"),false);
  assert.equal(accountLedgerDateQuery("all","","",now),"");
});

test("Custom dates validate and respect the selected inclusive date range", () => {
  const params=new URLSearchParams(accountLedgerDateQuery("custom","2026-10-11","2026-10-14",new Date(2026,9,19)));
  assert.equal(params.get("from"),localStart(2026,10,11));
  assert.equal(params.get("to"),localEnd(2026,10,14));
  assert.equal(accountLedgerDateQuery("custom","2026-10-14","2026-10-11"),null);
});
