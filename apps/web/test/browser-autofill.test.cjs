const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.join(__dirname, "..", "src");

function fields(relative) {
  const file = path.join(root, relative);
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const result = [];
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = node.tagName.getText(source);
      if (tag === "input" || tag === "textarea") {
        const attributes = {};
        for (const entry of node.attributes.properties) {
          if (!ts.isJsxAttribute(entry)) continue;
          const initial = entry.initializer;
          attributes[entry.name.text] = initial && ts.isStringLiteral(initial)
            ? initial.text : initial && ts.isJsxExpression(initial)
              ? initial.expression?.getText(source) : "";
        }
        result.push({ tag, ...attributes });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return result;
}

test("autofill is enabled across customer, Daily Cash, expense and transfer forms", () => {
  const checks = {
    "app/customers/page.tsx": ["cashledger_bank", "cashledger_mobile"],
    "app/customers/[id]/page.tsx": ["cashledger_beneficiary_name", "cashledger_account_holder"],
    "app/cash-counter/page.tsx": ["cashledger_friend_company", "cashledger_closing_handover_note"],
    "app/transactions/expense/page.tsx": ["cashledger_paid_to_payee_optional", "cashledger_note_optional"],
    "app/transactions/cash-transfer/page.tsx": ["cashledger_recipient_name", "cashledger_bank"],
    "components/quick-cash-rush-entry-v2.tsx": ["cashledger_company", "cashledger_customer_name"],
  };
  for (const [file, names] of Object.entries(checks)) {
    const entries = fields(file);
    for (const name of names) {
      assert.ok(entries.some(field => field.name === name && field.autoComplete === "on"),
        file + " should enable browser autofill for " + name);
    }
  }
});

test("sensitive bank, Aadhaar, transaction reference and card identifiers are excluded", () => {
  const entries = [
    ...fields("app/cash-counter/page.tsx"),
    ...fields("app/customers/[id]/page.tsx"),
    ...fields("app/transactions/card-swipe/page.tsx"),
  ];
  const sensitiveValues = new Set([
    "quickAadhaarLastFour", "quickCardLastFour", "quickBankAccountNumber",
    "completeBankAccountNumber", "completeReference", "cardLast4", "accountRef",
    "bRef", "newCardLastFour",
  ]);
  for (const field of entries) {
    if (sensitiveValues.has(field.value)) {
      assert.notEqual(field.autoComplete, "on", "Sensitive input must not enable autofill: " + field.value);
    }
  }
});

test("enabled text fields have stable input names across the app", () => {
  let count = 0;
  function walk(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, item.name);
      if (item.isDirectory()) walk(full);
      else if (item.name.endsWith(".tsx")) {
        for (const field of fields(path.relative(root, full))) {
          if (field.autoComplete !== "on") continue;
          assert.ok(field.name && /^[a-z][a-z0-9_]*$/.test(field.name), full + ": autofill requires a stable name");
          count++;
        }
      }
    }
  }
  ["app", "components"].forEach(part => walk(path.join(root, part)));
  assert.ok(count >= 120, "expected broad text field coverage, found " + count);
});
