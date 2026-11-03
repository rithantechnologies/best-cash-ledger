const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, '../src/app/reports/card-swipes');
const dateHelper = fs.readFileSync(path.join(dir, 'indian-date.ts'), 'utf8');
const page = fs.readFileSync(path.join(dir, 'page.tsx'), 'utf8');
const pdf = fs.readFileSync(path.join(dir, 'export-pdf.ts'), 'utf8');
test('report UI uses Indian dates and validates input before requesting results', () => {
  assert.match(dateHelper, /Date\.UTC/);
  assert.match(page, /reportIsoDate\(fromText\)/);
  assert.match(page, /reportIsoDate\(toText\)/);
  assert.match(page, /DD-MM-YYYY/);
  assert.match(page, /indianDateTime/);
});
test('PDF uses Indian date for both visible range and filename', () => {
  assert.match(pdf, /Business date: "\+indianDate\(from\)/);
  assert.match(pdf, /indianDate\(to\)/);
  assert.match(pdf, /Credit_Card_Report_"\+indianDate\(from\)/);
});
