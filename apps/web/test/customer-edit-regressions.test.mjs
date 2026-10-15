import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { customerCreatePrefill } from "../src/lib/customer-create-prefill.ts";
import { safeReturnTo, canRememberTransactionOrigin, transactionHref } from "../src/lib/transaction-return.ts";

test("numeric customer searches prefill mobile and never EB", () => {
  for (const [query, expectedMobile] of [
    ["9876543210", "9876543210"],
    ["+91 9876543210", "9876543210"],
    ["(91) 98765 43210", "9876543210"],
    ["987654321", "987654321"],
  ]) {
    const form = customerCreatePrefill(query);
    assert.equal(form.mobile, expectedMobile, query);
    assert.equal(form.ebNumber, "", query);
    assert.equal(form.fullName, "", query);
  }
  assert.deepEqual(customerCreatePrefill("siva 9876543210"), {
    fullName:"SIVA",mobile:"9876543210",ebNumber:"",
  });
});
test("transaction return links accept customers and accounts, reject external redirects", () => {
  assert.equal(transactionHref("abc", "/customers/xyz?tab=activity"), "/transactions/abc?returnTo=%2Fcustomers%2Fxyz%3Ftab%3Dactivity");
  assert.equal(safeReturnTo("/accounts/xyz"), "/accounts/xyz");
  assert.equal(safeReturnTo("//evil.example"), "");
  assert.equal(safeReturnTo("https://evil.example"), "");
  assert.equal(safeReturnTo("/\\evil.example"), "");
  assert.equal(canRememberTransactionOrigin("/accounts/xyz"),true);
  assert.equal(canRememberTransactionOrigin("/transactions/abc"),false);
});
test("uppercase listener excludes login/password and is available app-wide", () => {
  const source=readFileSync(new URL("../src/components/app-uppercase-input.tsx", import.meta.url),"utf8");
  const layout=readFileSync(new URL("../src/app/layout.tsx", import.meta.url),"utf8");
  assert.match(source,/pathname === "\/login"/);
  assert.match(source,/\["text", "search"\]/);
  assert.match(source,/document.addEventListener\("input", onInput, true\)/);
  assert.match(layout,/<AppUppercaseInput \/>/);
});
