const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/app/payables/page.tsx'),'utf8');
test('outstanding only is default and history can be selected',()=>{
 assert.ok(source.includes('[status,setStatus]=useState("OPEN")'));
 assert.ok(source.includes('params.set("openOnly","true")'));
 assert.ok(source.includes('All statuses / history'));
});
test('date totals are displayed and due day filters detailed payables',()=>{
 assert.ok(source.includes('Daily customer payout report'));
 assert.ok(source.includes('dueReport.totals.overdue'));
 assert.ok(source.includes('dueReport.totals.today'));
 assert.ok(source.includes('setDueDate(current=>current===g.date?"":g.date)'));
 assert.ok(source.includes('params.set("dueDate",dueDate)'));
});
test('show customer charges separately and download workbook through authenticated session',()=>{
 assert.ok(source.includes('p.sourceTransaction.cardSwipe.commissionAmount'));
 assert.ok(source.includes('net {money(p.originalAmount)}'));
 assert.ok(source.includes('due-report/excel?'));
 assert.ok(source.includes('credentials:"include"'));
});
