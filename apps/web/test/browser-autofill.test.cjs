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

test("browser autocomplete supports Aadhaar, card digits and bank account references across forms", () => {
  const checks = {
    "app/accounts/page.tsx": [
      ["last4", "cashledger_account_last_four"],
      ["editLast4", "cashledger_account_last_four"],
    ],
    "app/cash-counter/page.tsx": [
      ["quickAadhaarLastFour", "cashledger_aadhaar_last_four"],
      ["quickCardLastFour", "cashledger_card_last_four"],
      ["quickBankAccountNumber", "cashledger_bank_account_number"],
      ["completeBankAccountNumber", "cashledger_bank_account_number"],
    ],
    "app/customers/[id]/page.tsx": [
      ["accountRef", "cashledger_bank_account_number"],
      ["bRef", "cashledger_bank_account_number"],
      ["e2", "cashledger_card_last_four"],
      ["e3", "cashledger_bank_account_number"],
    ],
    "app/customers/page.tsx": [["cardLast4", "cashledger_card_last_four"]],
    "app/transactions/aeps/page.tsx": [["aadhaar", "cashledger_aadhaar_last_four"]],
    "app/transactions/card-due-clearing/page.tsx": [
      ["newLastFour", "cashledger_card_last_four"],
      ["addCardLastFour", "cashledger_card_last_four"],
    ],
    "app/transactions/card-swipe/page.tsx": [
      ["quickLastFour", "cashledger_card_last_four"],
      ["newCardLastFour", "cashledger_card_last_four"],
    ],
    "app/transactions/cash-transfer/page.tsx": [
      ["destinationValue", "cashledger_bank_account_number"],
    ],
    "app/transactions/micro-atm/page.tsx": [
      ["cardLastFour", "cashledger_card_last_four"],
    ],
    "components/quick-card-swipe-entry.tsx": [
      ["newLastFour", "cashledger_card_last_four"],
    ],
    "components/quick-cash-rush-entry-v2.tsx": [
      ["row.bankAccountNumber", "cashledger_bank_account_number"],
      ["row.aadhaarLastFour", "cashledger_aadhaar_last_four"],
      ["row.cardLastFour", "cashledger_card_last_four"],
    ],
  };
  let verified = 0;
  for (const [file, expected] of Object.entries(checks)) {
    const inputs = fields(file);
    for (const [value, name] of expected) {
      assert.ok(inputs.some(input => input.value === value &&
        input.name === name && input.autoComplete === "on"),
        file + ": " + value + " must support browser autofill");
      verified++;
    }
  }
  assert.equal(verified, 22);
  assert.equal(fields("app/customers/[id]/page.tsx").filter(input =>
    input.value === "e3" && input.name === "cashledger_bank_account_number" && input.autoComplete === "on").length, 2);
});

test("passwords use the browser password manager, not plain text history", () => {
  const current = fields("app/login/page.tsx").find(input => input.name === "password");
  assert.equal(current?.autoComplete, "current-password");
  for (const input of fields("app/users/page.tsx").filter(input =>
    input.name === "new_password" || input.name === "reset_new_password")) {
    assert.equal(input.type, "password");
    assert.equal(input.autoComplete, "new-password");
  }
});

test("transaction references remain outside generic browser history", () => {
  const inputs = fields("app/cash-counter/page.tsx");
  assert.notEqual(inputs.find(input => input.value === "completeReference")?.autoComplete, "on");
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
