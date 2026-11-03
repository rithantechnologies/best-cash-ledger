import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { indianDate } from "./indian-date";

type ReportRow = {
 transactionAt:string; customerName:string; mobile:string; cardType:string; cardLastFour:string;
 swipeAmount:number; gatewayFee:number; customerFee:number; payoutFee:number;
 netProfit:number; payableAmount:number; payoutSources:string[]; payInAccount:string;
};
type Summary = Pick<ReportRow,"swipeAmount"|"gatewayFee"|"customerFee"|"payoutFee"|"netProfit"|"payableAmount">;

const istDate=(timestamp:string)=>new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(timestamp)).replaceAll("/","-");
const amount = (value:number) => new Intl.NumberFormat("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2}).format(value);

/** PDF uses the same filtered transaction rows and summary as the on-screen register. */
export function downloadCardSwipePdf(from:string,to:string,rows:ReportRow[],summary:Summary){
 const pdf=new jsPDF({orientation:"landscape",unit:"mm",format:"a3"});
 const multiDay=from!==to;
 const headers=["S.NO",...(multiDay?["DATE"]:[]),"CUSTOMER / PAY IN","CELL NUMBER","CARD TYPE","CARD NUMBER","AMOUNT","COM. FEE","CUS. FEE","PAYOUT FEE","NET PROFIT","PAYABLE","PAYOUT","PAYIN"];
 const body=rows.map((r,i)=>[String(i+1),...(multiDay?[istDate(r.transactionAt)]:[]),r.customerName,r.mobile||"-",r.cardType,"**** "+r.cardLastFour,
  amount(r.swipeAmount),amount(r.gatewayFee),amount(r.customerFee),amount(r.payoutFee),amount(r.netProfit),amount(r.payableAmount),
  r.payoutSources.join(" / ")||"Pending",r.payInAccount||"-"]);
 body.push(["TOTAL",...(multiDay?[""]:[]),"","","","",amount(summary.swipeAmount),amount(summary.gatewayFee),amount(summary.customerFee),amount(summary.payoutFee),amount(summary.netProfit),amount(summary.payableAmount),"",""]);
 pdf.setFont("helvetica","bold");pdf.setFontSize(17);pdf.text("CREDIT CARD REPORT",14,16);
 pdf.setFont("helvetica","normal");pdf.setFontSize(10);
 pdf.text("Business date: "+indianDate(from)+(from===to?"":" to "+indianDate(to))+"  |  Transactions: "+rows.length,14,23);
 pdf.text("Amounts in INR. Card numbers masked. Net profit includes payout charges.",14,29);
 autoTable(pdf,{startY:34,head:[headers],body,theme:"grid",margin:{left:10,right:10,top:18,bottom:16},
  styles:{font:"helvetica",fontSize:7,cellPadding:2,overflow:"linebreak",valign:"middle"},
  headStyles:{fillColor:[246,210,91],textColor:[20,20,20],fontStyle:"bold"},
  columnStyles:multiDay?
   {0:{cellWidth:12},1:{cellWidth:23},2:{cellWidth:36},3:{cellWidth:24},4:{cellWidth:29},5:{cellWidth:20},6:{halign:"right"},7:{halign:"right"},8:{halign:"right"},9:{halign:"right"},10:{halign:"right"},11:{halign:"right"},12:{cellWidth:31},13:{cellWidth:27}}:
   {0:{cellWidth:12},1:{cellWidth:40},2:{cellWidth:25},3:{cellWidth:33},4:{cellWidth:21},5:{halign:"right"},6:{halign:"right"},7:{halign:"right"},8:{halign:"right"},9:{halign:"right"},10:{halign:"right"},11:{cellWidth:34},12:{cellWidth:30}},
  didParseCell:(data)=>{if(data.section==="body"&&data.row.index===body.length-1){data.cell.styles.fillColor=[45,185,105];data.cell.styles.textColor=[0,0,0];data.cell.styles.fontStyle="bold";}},
  didDrawPage:()=>{const page=pdf.getCurrentPageInfo().pageNumber;pdf.setFontSize(8);pdf.setTextColor(95);pdf.text("Cash Ledger  |  Page "+page,14,pdf.internal.pageSize.getHeight()-7);}
 });
 pdf.save("Credit_Card_Report_"+indianDate(from)+"_to_"+indianDate(to)+".pdf");
}
