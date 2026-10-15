import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../src");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const { safeReturnTo, withReturnTo, transactionHref, canRememberTransactionOrigin } =
  await import(pathToFileURL(path.join(root, "lib/transaction-return.ts")).href);

test("customer search numbers are pasted into mobile, never EB", async () => {
  const { customerCreatePrefill } = await import(
    pathToFileURL(path.join(root, "lib/customer-create-prefill.ts")).href
  );
  for (const number of ["9876543210", "0123456789", "+91 98765 43210"]) {
    const result = customerCreatePrefill(number);
    assert.ok(result.mobile.length >= 10, number);
    assert.equal(result.ebNumber, "", number);
  }
  const result = customerCreatePrefill("ravi 9876543210");
  assert.equal(result.fullName, "RAVI");
  assert.equal(result.mobile, "9876543210");
  assert.equal(result.ebNumber, "");
  const source = read("app/customers/page.tsx");
  assert.match(source, /name="customer_mobile" autoComplete="tel"/);
  assert.match(source, /name="customer_eb_reference" autoComplete="off"/);
});

test("typing and paste uppercases text without touching login and sensitive inputs", () => {
  const source = read("components/app-uppercase-input.tsx");
  assert.match(source, /pathname === "\/login"/);
  assert.match(source, /document\.addEventListener\("input", onInput, true\)/);
  assert.match(source, /document\.addEventListener\("submit", onSubmit, true\)/);
  assert.match(source, /"email", "url", "username", "current-password"/);
  assert.match(source, /\.toUpperCase\(\)/);
});

test("return URLs stay inside the app and preserve customer/account origin", () => {
  assert.equal(safeReturnTo("/customers/c1?tab=activity"), "/customers/c1?tab=activity");
  assert.equal(safeReturnTo("/accounts/a1"), "/accounts/a1");
  assert.equal(safeReturnTo("//evil.test/c"), "");
  assert.equal(safeReturnTo("https://evil.test"), "");
  assert.equal(safeReturnTo("/\\evil.test"), "");
  assert.equal(safeReturnTo("/login"), "");
  assert.equal(withReturnTo("/expenses/123/edit", "/accounts/a1"), "/expenses/123/edit?returnTo=%2Faccounts%2Fa1");
  assert.equal(transactionHref("123", "/customers/c1?tab=activity"),
    "/transactions/123?returnTo=%2Fcustomers%2Fc1%3Ftab%3Dactivity");
  assert.equal(canRememberTransactionOrigin("/transactions/123"), false);
  assert.equal(canRememberTransactionOrigin("/customers/c1"), true);
});
