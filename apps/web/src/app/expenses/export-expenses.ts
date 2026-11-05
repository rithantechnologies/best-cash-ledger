import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type ExpenseExportRow = {
 transactionNumber:string; date:string; entered:string; type:string;
 description:string; category:string; reference:string; amount:number;
};
export type ExpenseCategoryRow = {name:string;amount:number};
export type ExpenseExportData = {period:string;category:string;rows:ExpenseExportRow[];categories:ExpenseCategoryRow[];total:number};

const num=(n:number)=>new Intl.NumberFormat("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const stamp=()=>new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",dateStyle:"medium",timeStyle:"short"}).format(new Date());
const fileDate=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()).replaceAll("/","-");
const fileName=()=>"CashLedger_Expenses_"+fileDate();

export function downloadExpensesPdf(data:ExpenseExportData){
 const pdf=new jsPDF({orientation:"landscape",unit:"mm",format:"a4",compress:true});
 pdf.setFillColor(24,38,57);pdf.rect(0,0,297,19,"F");
 pdf.setFont("helvetica","bold");pdf.setTextColor(255,255,255);pdf.setFontSize(16);
 pdf.text("CASH LEDGER  /  EXPENSES REPORT",12,12);
 pdf.setTextColor(48,60,75);pdf.setFontSize(10);pdf.setFont("helvetica","normal");
 pdf.text("Period: "+data.period+"   |   Category: "+data.category,12,27);
 pdf.text("Expenses: "+data.rows.length+"   |   Total: INR "+num(data.total),12,33);
 pdf.setFontSize(8);pdf.text("Generated: "+stamp(),210,33);
 const categoryTable= data.categories.map(c=>[c.name,"INR "+num(c.amount)]);
 if(categoryTable.length){
  autoTable(pdf,{startY:39,head:[["CATEGORY SUMMARY","AMOUNT (INR)"]],body:categoryTable,theme:"striped",
    styles:{fontSize:8,cellPadding:2},headStyles:{fillColor:[36,77,126]},margin:{left:12,right:12},tableWidth:125});
 }
 const end=(pdf as jsPDF & {lastAutoTable?:{finalY:number}}).lastAutoTable?.finalY??39;
 autoTable(pdf,{
  startY:end+9,
  head:[["#","EXPENSE DATE","ENTERED","TYPE","PARTICULARS","CATEGORY","REFERENCE / NOTES","AMOUNT (INR)"]],
  body:data.rows.map((r,i)=>[String(i+1),r.date,r.entered,r.type,r.description,r.category,r.reference,num(r.amount)]),
  foot:[["","","","","","","TOTAL",num(data.total)]],
  showFoot:"lastPage",showHead:"everyPage",theme:"grid",
  styles:{fontSize:7.2,cellPadding:2,overflow:"linebreak"},headStyles:{fillColor:[24,38,57]},
  footStyles:{fillColor:[224,239,229],textColor:[20,83,48],fontStyle:"bold"},
  columnStyles:{0:{cellWidth:10},1:{cellWidth:22},2:{cellWidth:30},3:{cellWidth:20},4:{cellWidth:56},5:{cellWidth:40},6:{cellWidth:65},7:{cellWidth:30,halign:"right"}},
  margin:{left:12,right:12,top:16,bottom:14},
 });
 const pages=pdf.getNumberOfPages();for(let i=1;i<=pages;i++){pdf.setPage(i);pdf.setTextColor(95,105,118);pdf.setFontSize(8);pdf.text("Cash Ledger  |  Page "+i+" / "+pages,285,203,{align:"right"});}
 pdf.save(fileName()+".pdf");
}

const xml=(s:string)=>s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,"");
const textCell=(value:string)=>'<Cell><Data ss:Type="String">'+xml(value)+'</Data></Cell>';
const numberCell=(n:number)=>'<Cell ss:StyleID="amt"><Data ss:Type="Number">'+(Number.isFinite(n)?n:0)+'</Data></Cell>';
const row=(cells:string[])=>"<Row>"+cells.join("")+"</Row>";
const worksheet=(name:string,rows:string[])=>'<Worksheet ss:Name="'+xml(name)+'"><Table>'+rows.join("")+'</Table></Worksheet>';
export function downloadExpensesExcel(data:ExpenseExportData){
 // SpreadsheetML 2003 is a native Excel workbook format; no external library or server access needed.
 const summary=[
  row([textCell("CASH LEDGER - EXPENSES REPORT")]),
  row([textCell("Period"),textCell(data.period)]),row([textCell("Category"),textCell(data.category)]),
  row([textCell("Generated"),textCell(stamp())]),row([textCell("Transactions"),numberCell(data.rows.length)]),
  row([textCell("Total expenses (INR)"),numberCell(data.total)]),row([]),
  row([textCell("Expense category"),textCell("Amount (INR)")]),
  ...data.categories.map(c=>row([textCell(c.name),numberCell(c.amount)]))
 ];
 const ledger=[
  row(["No.","Transaction #","Expense Date","Entered At","Type","Particulars","Category","Reference / Notes","Amount (INR)"].map(textCell)),
  ...data.rows.map((r,i)=>row([textCell(String(i+1)),textCell(r.transactionNumber),textCell(r.date),textCell(r.entered),textCell(r.type),textCell(r.description),textCell(r.category),textCell(r.reference),numberCell(r.amount)])),
  row([textCell("TOTAL"),...Array(7).fill(textCell("")),numberCell(data.total)])
 ];
 const book='<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>'
  +'<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'
  +'<Styles><Style ss:ID="amt"><NumberFormat ss:Format="#,##0.00"/></Style></Styles>'
  +worksheet("Summary",summary)+worksheet("Expense Ledger",ledger)+'</Workbook>';
 const url=URL.createObjectURL(new Blob([book],{type:"application/vnd.ms-excel"}));
 const anchor=document.createElement("a");anchor.href=url;anchor.download=fileName()+".xls";document.body.appendChild(anchor);anchor.click();anchor.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),60000);
}
