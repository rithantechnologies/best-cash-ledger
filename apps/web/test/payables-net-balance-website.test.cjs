const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const web=fs.readFileSync(path.join(__dirname,'../src/app/payables/page.tsx'),'utf8');
const component=fs.readFileSync(path.join(__dirname,'../src/components/payables-net-balance-report.tsx'),'utf8');

test('website renders the same named views as the exported Excel workbook',()=>{
 for(const text of ['NET BALANCE','DATE WISE','PENDING DETAILS','CARD TOTALS','CUSTOMER WISE'])
  assert.ok(component.includes('label:"'+text+'"'), text);
 assert.ok(web.includes('<PayablesNetBalanceReport report={dueReport}'));
 assert.ok(web.includes('apiFetch<NetBalanceReport>("/payables/due-report?"'));
});
test('purple payable/amount cells and green grand total mirror the Excel',()=>{
 assert.ok(component.includes('bg-[#55328c]'));
 assert.ok(component.includes('bg-[#604095]'));
 assert.ok(component.includes('bg-[#167a4c]'));
 for(const title of ['SWIPE DATE','GATEWAY / SOURCE','PAYABLE','AMOUNT','DUE DATE','DAYS','GROSS SWIPE','SERVICE CHARGE','NET PAYABLE','ALREADY PAID','ADVANCE','REFERENCE'])
  assert.ok(component.includes('"'+title+'"'),title);
 assert.ok(component.includes('<MoneyFooter amount={report.totals.outstanding} label="GRAND TOTAL"'));
});
test('each displayed payable uses the authoritative amount from backend and opens its payment details',()=>{
 assert.ok(component.includes('cash(row.remaining)'));
 assert.ok(component.includes('row.customerCharges'));
 assert.ok(component.includes('row.netPayable'));
 assert.ok(component.includes('row.paid'));
 assert.ok(component.includes('row.advance'));
 assert.ok(component.includes('href={"/payables/"+encodeURIComponent(row.id)}'));
 assert.ok(!component.includes('Math.random'));
});
test('due-date and customer views work without creating financial mutations',()=>{
 assert.ok(component.includes('onSelectDate(dateGroup.date)'));
 assert.ok(web.includes('setDueDate(current=>current===date?"":date)'));
 assert.ok(component.includes('report.rows.filter(row=>row.customerId===visibleCustomer?.id)'));
 assert.ok(component.includes('aria-label="Select customer report"'));
 assert.ok(!component.includes('method:"POST"'));
 assert.ok(!component.includes('apiFetch('));
 assert.ok(web.includes('Download NET BALANCE Excel'));
});
test('mobile layout scrolls horizontally instead of hiding table columns',()=>{
 assert.ok(component.includes('overflow-x-auto overscroll-x-contain'));
 assert.ok(component.includes('min-w-[1430px]'));
 assert.ok(component.includes('role="tablist"'));
 assert.ok(component.includes('aria-selected={view===tab.key}'));
});
