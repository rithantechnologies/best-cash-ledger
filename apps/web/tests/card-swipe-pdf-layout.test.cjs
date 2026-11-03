const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { jsPDF } = require('jspdf');

const originalLoader = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  const code = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  module._compile(js, filename);
};
const { downloadCardSwipePdf } = require('../src/app/reports/card-swipes/export-pdf.ts');
require.extensions['.ts'] = originalLoader;

const one = {
  transactionAt: '2026-11-03T10:30:00Z', customerName: 'SIVAKARTHIKEYAN VELAYUTHAM',
  mobile: '9876543210', cardType: 'KOTAK VISA', cardLastFour: '5492',
  swipeAmount: 22900, gatewayFee: 366, customerFee: 527, payoutFee: 18,
  netProfit: 143, payableAmount: 22373,
  payoutSources: ['ROINET', 'PAYSWITCH BANK'], payInAccount: 'INDUS SARA',
};
const summary = {
  swipeAmount: 22900, gatewayFee: 366, customerFee: 527, payoutFee: 18,
  netProfit: 143, payableAmount: 22373,
};

test('A3 PDF paginates vertically, preserves columns and Indian date filenames', () => {
  const singleName = 'Credit_Card_Report_03-11-2026_to_03-11-2026.pdf';
  const multiName = 'Credit_Card_Report_02-11-2026_to_03-11-2026.pdf';
  const files = [];
  try {
    const single = downloadCardSwipePdf('2026-11-03', '2026-11-03', Array.from({ length: 60 }, (_, i) => ({ ...one, customerName: one.customerName + ' ' + i })), summary);
    const multi = downloadCardSwipePdf('2026-11-02', '2026-11-03', [one], summary);
    files.push({filename:singleName, pdf:single}, {filename:multiName, pdf:multi});
    for (const { filename, pdf } of files) {
      const data = fs.readFileSync(filename);
      assert.ok(data.length > 1800, `PDF too small: ${data.length} bytes`);
      assert.equal(data.subarray(0, 5).toString('ascii'), '%PDF-');
      assert.equal(Math.round(pdf.internal.pageSize.getWidth()), 420);
      assert.ok(pdf.getNumberOfPages() >= 1);
      assert.ok(!data.toString('latin1').includes('{total_pages_count_string}'));
    }
    assert.ok(single.getNumberOfPages() >= 2, '60 rows should paginate vertically');
    assert.equal(multi.getNumberOfPages(), 1, 'Single row multi-day report must not split horizontally');
    const sample = process.env.CASHLEDGER_PDF_TEST_OUTPUT;
    if (sample) fs.copyFileSync(multiName, sample);
  } finally {
    for (const filename of [singleName, multiName]) if (fs.existsSync(filename)) fs.unlinkSync(filename);
  }
});
