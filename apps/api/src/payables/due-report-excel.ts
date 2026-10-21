import ExcelJS from 'exceljs';
import type { buildDueReport } from './due-report.js';

type Report = ReturnType<typeof buildDueReport>;
type Item = Report['rows'][number];
type Sheet = ExcelJS.Worksheet;

const NAVY='FF1D3452', PURPLE='FF5B368E', PURPLE2='FF704DA1', GREEN='FF167A4C';
const WHITE='FFFFFFFF', LIGHT='FFF4F6FB', INK='FF1E293B', BORDER='FFDCE2EA';
const INR='"₹"#,##0.00;[Red]("₹"#,##0.00)', DATE='dd mmm yy';
function xdate(day:string){return new Date(day+'T12:00:00Z');}
function dateLabel(day:string){return xdate(day).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});}
function text(value:unknown){const s=String(value??'');return /^[=+@\-]/.test(s)?"'"+s:s;}
function box(sh:Sheet,row:number,start:number,end:number,fill:string) {
  for(let n=start;n<=end;n++)sh.getRow(row).getCell(n).fill={type:'pattern',pattern:'solid',fgColor:{argb:fill}};
}
function buildSheet(book:ExcelJS.Workbook,name:string,widths:number[],title:string,subtitle:string){
  const sh=book.addWorksheet(name,{views:[{state:'frozen',ySplit:9}]});
  sh.columns=widths.map((width,i)=>({key:'col'+(i+1),width}));
  sh.properties.defaultRowHeight=24;
  sh.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,
    margins:{left:0.25,right:0.25,top:0.4,bottom:0.4,header:0.2,footer:0.2}};
  sh.pageSetup.printTitlesRow='1:9';
  sh.headerFooter.oddFooter='&LCASH LEDGER  |  NET CUSTOMER PAYABLE  &RPage &P of &N';
  sh.mergeCells(1,1,2,widths.length);
  box(sh,1,1,widths.length,NAVY);box(sh,2,1,widths.length,NAVY);
  sh.getRow(1).height=31;sh.getRow(2).height=19;
  const heading=sh.getCell(1,1);
  heading.value=title;
  heading.font={name:'Aptos Display',size:20,bold:true,color:{argb:WHITE}};
  heading.alignment={vertical:'middle',indent:1};
  sh.mergeCells(3,1,3,widths.length);
  sh.getCell(3,1).value=subtitle;
  sh.getCell(3,1).font={name:'Aptos',size:10,color:{argb:'FF526378'}};
  sh.getCell(3,1).alignment={indent:1,vertical:'middle'};
  sh.getRow(3).height=26;sh.getRow(4).height=9;sh.getRow(8).height=9;
  return sh;
}
function kpi(sh:Sheet,from:number,to:number,label:string,value:number,bg:string) {
  sh.mergeCells(5,from,5,to);sh.mergeCells(6,from,7,to);
  for(let r=5;r<=7;r++)box(sh,r,from,to,bg);
  const head=sh.getCell(5,from);
  head.value=label;
  head.font={name:'Aptos',size:9,bold:true,color:{argb:'FF526378'}};
  head.alignment={indent:1,vertical:'middle'};
  const amount=sh.getCell(6,from);
  amount.value=value;amount.numFmt=INR;
  amount.font={name:'Aptos Display',size:17,bold:true,color:{argb:INK}};
  amount.alignment={indent:1,vertical:'middle'};
  sh.getRow(5).height=21;sh.getRow(6).height=25;sh.getRow(7).height=17;
}
function headers(sh:Sheet,names:string[],purple:boolean) {
  const row=sh.getRow(9);row.values=[,...names];row.height=36;
  row.eachCell({includeEmpty:true},(cell,c)=>{
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:purple&&[3,4].includes(c)?PURPLE:NAVY}};
    cell.font={name:'Aptos',size:9,bold:true,color:{argb:WHITE}};
    cell.alignment={vertical:'middle',wrapText:true,indent:1};
  });
}
function body(sh:Sheet,rowNo:number,purple:boolean){
  const row=sh.getRow(rowNo);row.height=28;
  row.eachCell({includeEmpty:true},(cell,c)=>{
    const center=purple&&[3,4].includes(c);
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:center?(rowNo%2?PURPLE:PURPLE2):(rowNo%2?WHITE:LIGHT)}};
    cell.font={name:'Aptos',size:10,bold:center,color:{argb:center?WHITE:INK}};
    cell.alignment={vertical:'middle',horizontal:typeof cell.value==='number'?'right':'left',indent:typeof cell.value==='number'?0:1};
    cell.border={bottom:{style:'hair',color:{argb:BORDER}}};
  });
}
function summaryFooter(sh:Sheet,rowNo:number,total:number,label:string) {
  sh.mergeCells(rowNo,1,rowNo,3);sh.mergeCells(rowNo,5,rowNo,12);
  box(sh,rowNo,1,12,GREEN);sh.getRow(rowNo).height=34;
  const c=sh.getCell(rowNo,1);
  c.value=label;c.font={name:'Aptos',size:11,bold:true,color:{argb:WHITE}};
  c.alignment={indent:1,vertical:'middle'};
  const value=sh.getCell(rowNo,4);
  value.value=total;value.numFmt=INR;
  value.font={name:'Aptos Display',size:15,bold:true,color:{argb:WHITE}};
  value.alignment={horizontal:'right',vertical:'middle'};
  const note=sh.getCell(rowNo,5);
  note.value='AMOUNT STILL TO PAY AFTER CUSTOMER CHARGES, PAYMENTS & ADVANCES';
  note.font={name:'Aptos',size:9,italic:true,color:{argb:WHITE}};
  note.alignment={indent:1,vertical:'middle'};
}
const topCols=['SWIPE DATE','GATEWAY / SOURCE','PAYABLE','AMOUNT','DUE DATE','DAYS','GROSS SWIPE','SERVICE CHARGE','NET PAYABLE','ALREADY PAID','ADVANCE','REFERENCE'];
const topWidths=[16,25,48,19,17,15,20,19,20,19,18,22];
function source(r:Item){return text([r.provider,r.gateway].filter(Boolean).join(' / ')||'—');}
function term(r:Item){return r.termDays!==null&&Number.isFinite(r.termDays)?String(r.termDays)+' DAYS':text(r.term).toUpperCase();}
function dueColor(status:string){return status==='OVERDUE'?'FFB42338':status==='DUE TODAY'||status==='TODAY'?'FF9A6210':GREEN;}
function addTopRow(sh:Sheet,rowNo:number,p:Item,customerSheet=false) {
  sh.getRow(rowNo).values=[,xdate(p.swipeDate),source(p),
    text(customerSheet?p.card:p.customer.toUpperCase()+' - '+p.card),
    p.remaining,xdate(p.dueDate),term(p),p.grossSwipe,p.customerCharges,
    p.netPayable,p.paid,p.advance,text(p.transactionNumber)];
  body(sh,rowNo,true);
  sh.getRow(rowNo).getCell(1).numFmt=DATE;sh.getRow(rowNo).getCell(5).numFmt=DATE;
  for(const c of [4,7,8,9,10,11])sh.getRow(rowNo).getCell(c).numFmt=INR;
  sh.getRow(rowNo).getCell(5).font={name:'Aptos',bold:true,color:{argb:dueColor(p.status)}};
}
function topKpis(sh:Sheet,total:number,today:number,overdue:number,upcoming:number){
  kpi(sh,1,3,'TOTAL STILL TO PAY',total,'FFECE6F9');
  kpi(sh,4,6,'DUE TODAY',today,'FFFFF2D5');
  kpi(sh,7,9,'OVERDUE',overdue,'FFFBE7EB');
  kpi(sh,10,12,'UPCOMING',upcoming,'FFE6F5EB');
}
function netBalance(book:ExcelJS.Workbook,r:Report){
  const sh=buildSheet(book,'NET BALANCE',topWidths,'NET BALANCE  /  PAYABLE',
    'AS AT '+dateLabel(r.businessDate)+'  |  OUTSTANDING ENTRIES ONLY  |  SORTED BY DUE DATE  |  AMOUNTS IN INR');
  topKpis(sh,r.totals.outstanding,r.totals.today,r.totals.overdue,r.totals.upcoming);
  headers(sh,topCols,true);
  let at=10;
  for(const g of r.dates){
    sh.mergeCells(at,1,at,3);sh.mergeCells(at,5,at,12);box(sh,at,1,12,'FFE5E8F3');
    const title=sh.getCell(at,1);
    title.value='DUE '+dateLabel(g.date).toUpperCase()+'  |  '+g.customerCount+' CUSTOMER'+(g.customerCount===1?'':'S');
    title.font={name:'Aptos',size:10,bold:true,color:{argb:NAVY}};
    title.alignment={indent:1,vertical:'middle'};
    const sum=sh.getCell(at,4);sum.value=g.remaining;sum.numFmt=INR;
    sum.font={name:'Aptos',bold:true,color:{argb:PURPLE}};
    sum.alignment={horizontal:'right',vertical:'middle'};
    const status=sh.getCell(at,5);
    status.value=g.status+'  |  '+g.itemCount+' entries';
    status.font={name:'Aptos',size:9,bold:true,color:{argb:dueColor(g.status)}};
    status.alignment={indent:1,vertical:'middle'};
    sh.getRow(at).height=24;
    at++;
    for(const item of r.rows.filter(v=>v.dueDate===g.date))addTopRow(sh,at++,item);
  }
  if(!r.rows.length){
    sh.mergeCells('A10:L12');
    sh.getCell('A10').value='No outstanding customer payments.';
    sh.getCell('A10').alignment={horizontal:'center',vertical:'middle'};
    at=14;
  }
  summaryFooter(sh,at,r.totals.outstanding,'GRAND TOTAL');
  sh.pageSetup.printArea='A1:L'+at;
}
function dateWise(book:ExcelJS.Workbook,r:Report){
  const sh=buildSheet(book,'DATE WISE',[18,16,15,13,13,19,21,21,20,19,22],
    'DATE-WISE  /  PAYMENT PLAN','PAYMENT DUE DATES & AMOUNTS  |  AS AT '+dateLabel(r.businessDate));
  kpi(sh,1,3,'TOTAL OUTSTANDING',r.totals.outstanding,'FFECE6F9');
  kpi(sh,4,6,'OVERDUE',r.totals.overdue,'FFFBE7EB');
  kpi(sh,7,8,'DUE TODAY',r.totals.today,'FFFFF2D5');
  kpi(sh,9,11,'UPCOMING',r.totals.upcoming,'FFE6F5EB');
  headers(sh,['DUE DATE','STATUS','CUSTOMERS','CARDS','ENTRIES','GROSS SWIPE','CUSTOMER CHARGE','NET PAYABLE','PAID','ADVANCE','STILL TO PAY'],false);
  for(const [idx,v] of r.dates.entries()){
    const row=idx+10;
    sh.getRow(row).values=[,xdate(v.date),v.status,v.customerCount,v.cardCount,v.itemCount,
      v.grossSwipe,v.customerCharges,v.netPayable,v.paid,v.advance,v.remaining];
    body(sh,row,false);
    sh.getRow(row).getCell(1).numFmt=DATE;
    for(let c=6;c<=11;c++)sh.getRow(row).getCell(c).numFmt=INR;
    sh.getRow(row).getCell(2).font={name:'Aptos',bold:true,color:{argb:dueColor(v.status)}};
    sh.getRow(row).getCell(11).font={name:'Aptos',bold:true,color:{argb:NAVY}};
  }
  if(r.dates.length)sh.autoFilter={from:{row:9,column:1},to:{row:9+r.dates.length,column:11}};
  sh.pageSetup.printArea='A1:K'+(9+r.dates.length);
}
function detailed(book:ExcelJS.Workbook,r:Report){
  const names=['DUE DATE','SWIPE DATE','CUSTOMER','MOBILE','CARD','SOURCE','TRANSACTION','PAYMENT TERM','GROSS SWIPE','CUSTOMER FEE %','CUSTOMER CHARGE','NET PAYABLE','PAID','ADVANCE','STILL TO PAY','GATEWAY COST','PRIORITY'];
  const sh=buildSheet(book,'PENDING DETAILS',[18,18,30,18,28,26,22,17,19,18,21,20,18,18,21,19,18],
    'PENDING PAYOUTS  /  FULL DETAILS',
    'GATEWAY CHARGE IS A BUSINESS COST AND DOES NOT REDUCE THE CUSTOMER PAYABLE AGAIN');
  kpi(sh,1,5,'TOTAL OUTSTANDING',r.totals.outstanding,'FFECE6F9');
  kpi(sh,6,9,'DUE TODAY',r.totals.today,'FFFFF2D5');
  kpi(sh,10,13,'OVERDUE',r.totals.overdue,'FFFBE7EB');
  kpi(sh,14,17,'UPCOMING',r.totals.upcoming,'FFE6F5EB');
  headers(sh,names,false);
  for(const [idx,v] of r.rows.entries()){
    const row=idx+10;
    sh.getRow(row).values=[,xdate(v.dueDate),xdate(v.swipeDate),text(v.customer),text(v.mobile),
      text(v.card),source(v),text(v.transactionNumber),term(v),
      v.grossSwipe,v.customerRate??0,v.customerCharges,v.netPayable,
      v.paid,v.advance,v.remaining,v.gatewayCharge,v.status];
    body(sh,row,false);
    sh.getRow(row).getCell(1).numFmt=DATE;sh.getRow(row).getCell(2).numFmt=DATE;
    for(const c of [9,11,12,13,14,15,16])sh.getRow(row).getCell(c).numFmt=INR;
    sh.getRow(row).getCell(10).numFmt='0.00"%"';
    sh.getRow(row).getCell(17).font={name:'Aptos',bold:true,color:{argb:dueColor(v.status)}};
  }
  if(r.rows.length)sh.autoFilter={from:{row:9,column:1},to:{row:9+r.rows.length,column:17}};
  sh.pageSetup.printArea='A1:Q'+(9+r.rows.length);
}
function cardTotals(book:ExcelJS.Workbook,r:Report){
  const sh=buildSheet(book,'CARD TOTALS',[31,18,29,19,17,20,20,20,19,18,22],
    'CUSTOMER & CARD  /  BALANCES','ONE ROW PER CUSTOMER CARD  |  EARLIEST DUE DATE  |  OUTSTANDING ONLY');
  kpi(sh,1,4,'TOTAL OUTSTANDING',r.totals.outstanding,'FFECE6F9');
  kpi(sh,5,7,'OPEN PAYABLES',r.totals.itemCount,'FFE8F1FB');
  kpi(sh,8,11,'DUE TODAY',r.totals.today,'FFFFF2D5');
  headers(sh,['CUSTOMER','MOBILE','CARD','EARLIEST DUE','ENTRIES','GROSS SWIPE','SERVICE CHARGE','NET PAYABLE','PAID','ADVANCE','BALANCE'],false);
  for(const [idx,v] of r.cards.entries()){
    const row=idx+10;
    sh.getRow(row).values=[,text(v.customer),text(v.mobile),text(v.card),xdate(v.earliestDue),
      v.swipeCount,v.grossSwipe,v.customerCharges,v.netPayable,v.paid,v.advance,v.remaining];
    body(sh,row,false);sh.getRow(row).getCell(4).numFmt=DATE;
    for(let c=6;c<=11;c++)sh.getRow(row).getCell(c).numFmt=INR;
    sh.getRow(row).getCell(11).font={name:'Aptos',bold:true,color:{argb:PURPLE}};
  }
  if(r.cards.length)sh.autoFilter={from:{row:9,column:1},to:{row:9+r.cards.length,column:11}};
  sh.pageSetup.printArea='A1:K'+(9+r.cards.length);
}
function customerName(name:string,used:Set<string>){
  const base=(name||'CUSTOMER').replace(/[\\/*?:\[\]]/g,' ').replace(/\s+/g,' ').trim().toUpperCase().slice(0,31)||'CUSTOMER';
  let nameCandidate=base;let n=2;
  while(used.has(nameCandidate.toLowerCase())){
    const suffix=' '+(n++);
    nameCandidate=base.slice(0,31-suffix.length)+suffix;
  }
  used.add(nameCandidate.toLowerCase());
  return nameCandidate;
}
function customerSheets(book:ExcelJS.Workbook,r:Report){
  const groups=new Map<string,Item[]>();
  for(const row of r.rows){if(!groups.has(row.customerId))groups.set(row.customerId,[]);groups.get(row.customerId)!.push(row);}
  const used=new Set(['net balance','date wise','pending details','card totals']);
  for(const lines of groups.values()){
    const total=Number(lines.reduce((a,b)=>a+b.remaining,0).toFixed(2));
    const overdue=Number(lines.filter(v=>v.dueDate<r.businessDate).reduce((a,b)=>a+b.remaining,0).toFixed(2));
    const today=Number(lines.filter(v=>v.dueDate===r.businessDate).reduce((a,b)=>a+b.remaining,0).toFixed(2));
    const soon=Number(lines.filter(v=>v.dueDate>r.businessDate).reduce((a,b)=>a+b.remaining,0).toFixed(2));
    const customer=lines[0].customer;
    const sh=buildSheet(book,customerName(customer,used),topWidths,
      text(customer).toUpperCase()+'  /  CARD PAYABLES',
      'CUSTOMER CARD-WISE PENDING PAYOUTS  |  AS AT '+dateLabel(r.businessDate));
    topKpis(sh,total,today,overdue,soon);
    headers(sh,topCols.map(h=>h==='PAYABLE'?'CARD / PAYABLE':h),true);
    let rowNum=10;
    for(const row of lines)addTopRow(sh,rowNum++,row,true);
    summaryFooter(sh,rowNum,total,'CUSTOMER TOTAL');
    sh.pageSetup.printArea='A1:L'+rowNum;
  }
}
export async function makeClientPayableWorkbook(report:Report) {
  const book=new ExcelJS.Workbook();
  book.creator='Cash Ledger';
  book.subject='Outstanding customer payments grouped by due date';
  book.title='Cash Ledger | Net Balance';
  book.created=new Date(report.generatedAt);
  netBalance(book,report);
  dateWise(book,report);
  detailed(book,report);
  cardTotals(book,report);
  customerSheets(book,report);
  return book;
}
