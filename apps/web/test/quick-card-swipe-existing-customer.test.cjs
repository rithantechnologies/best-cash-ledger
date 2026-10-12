const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const sourceText = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'quick-card-swipe-entry.tsx'), 'utf8');
const tree = ts.createSourceFile('quick-card-swipe-entry.tsx', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const findJsx = (tag, attribute, value) => {
  let result = false;
  function visit(node) {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(tree) === tag) {
      const attr = node.attributes.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.text === attribute);
      if (attr && (!value || attr.initializer?.getText(tree).includes(value))) result = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return result;
};

test('existing-customer card chooser offers inline Add card/bank and a separate save action', () => {
  assert.ok(sourceText.includes('+ Add card / bank'));
  assert.ok(findJsx('button', 'onClick', 'saveExistingCard'));
  assert.match(sourceText, /No card saved yet/);
  assert.match(sourceText, /Save & use card/);
});
test('save creates a card on the selected existing customer, not a duplicate customer', () => {
  const start = sourceText.indexOf('async function saveExistingCard()');
  const end = sourceText.indexOf('function close()', start);
  const saveCode = sourceText.slice(start, end);
  assert.match(saveCode, /apiFetch<Card>\("\/customers\/"\+customerId\+"\/cards"/);
  assert.match(saveCode, /customerId=customer\.id/);
  assert.match(saveCode, /setCustomer\(current=>current\?\.id===customerId/);
  assert.match(saveCode, /setCardId\(card\.id\)/);
  assert.match(saveCode, /setNetwork\(card\.cardNetworkId\|\|existingCardNetworkId\)/);
  assert.doesNotMatch(saveCode, /\/customers\/quick-card|\/customers",/);
});
test('card entry is validated and duplicate bank + four digits selects existing card', () => {
  assert.match(sourceText, /!\/\^\\d\{4\}\$\/\.test\(existingCardLast4\)/);
  assert.match(sourceText, /card\.lastFourDigits===existingCardLast4&&card\.bankName\.toLowerCase\(\)===bank\.toLowerCase\(\)/);
  assert.match(sourceText, /if\(duplicate\)\{/);
  assert.match(sourceText, /!addingCardBusy&&!addingCard&&swipe>0/);
});
test('fields store issuing bank, final four digits and optional nickname only', () => {
  assert.ok(findJsx('input', 'name', 'cashledger_existing_customer_card_bank'));
  assert.ok(findJsx('input', 'name', 'cashledger_existing_customer_card_lastfour'));
  assert.ok(findJsx('input', 'name', 'cashledger_existing_customer_card_nickname'));
  assert.match(sourceText, /bankName:bank,cardType:"CREDIT",cardNetworkId:existingCardNetworkId/);
  assert.match(sourceText, /lastFourDigits:existingCardLast4/);
});
