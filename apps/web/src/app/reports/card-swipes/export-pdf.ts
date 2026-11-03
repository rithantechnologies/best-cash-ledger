import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { indianDate } from "./indian-date";

type ReportRow = {
  transactionAt: string;
  customerName: string;
  mobile: string;
  cardType: string;
  cardLastFour: string;
  swipeAmount: number;
  gatewayFee: number;
  customerFee: number;
  payoutFee: number;
  netProfit: number;
  payableAmount: number;
  payoutSources: string[];
  payInAccount: string;
};
type Summary = Pick<ReportRow, "swipeAmount" | "gatewayFee" | "customerFee" | "payoutFee" | "netProfit" | "payableAmount">;

const number = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amount = (value: number) => number.format(value);
const dateIST = (timestamp: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" })
    .format(new Date(timestamp)).replaceAll("/", "-");
const timestampIST = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (key: string) => parts.find((part) => part.type === key)?.value ?? "";
  return `${get("day")}-${get("month")}-${get("year")} ${get("hour")}:${get("minute")} IST`;
};

// A3 landscape has 420 mm width. All columns total exactly 396 mm,
// leaving 12 mm side margins; autoTable must never split the table horizontally.
const singleDayWidths = [11, 45, 25, 31, 22, 39, 28, 28, 28, 32, 38, 37, 32];
const multiDayWidths = [11, 21, 40, 24, 28, 20, 36, 26, 26, 26, 30, 34, 39, 35];
const rgb = {
  navy: [23, 37, 57] as [number, number, number],
  gold: [250, 213, 88] as [number, number, number],
  green: [220, 245, 228] as [number, number, number],
  line: [223, 229, 234] as [number, number, number],
  muted: [93, 105, 120] as [number, number, number],
};

/** Generate a printable, single-width register from exactly the filtered rows on screen. */
export function downloadCardSwipePdf(from: string, to: string, rows: ReportRow[], summary: Summary) {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3", compress: true });
  const multiDay = from !== to;
  const widths = multiDay ? multiDayWidths : singleDayWidths;
  const headers = [
    "S.NO", ...(multiDay ? ["DATE"] : []), "CUSTOMER / PAY IN", "CELL NUMBER", "CARD TYPE",
    "CARD NUMBER", "AMOUNT", "COM. FEE", "CUS. FEE", "PAYOUT FEE", "NET PROFIT",
    "PAYABLE", "PAYOUT", "PAYIN",
  ];
  const numbersStart = multiDay ? 6 : 5;
  const numericColumns = new Set(Array.from({ length: 6 }, (_, index) => numbersStart + index));
  const columns: Record<number, { cellWidth: number; halign?: "left" | "right" | "center" }> = {};
  widths.forEach((width, index) => {
    columns[index] = { cellWidth: width, halign: numericColumns.has(index) ? "right" : index === 0 || (multiDay && index === 1) ? "center" : "left" };
  });
  const body: string[][] = rows.map((row, index) => [
    String(index + 1), ...(multiDay ? [dateIST(row.transactionAt)] : []),
    row.customerName || "-", row.mobile || "-", row.cardType || "-", `**** ${row.cardLastFour || "----"}`,
    amount(row.swipeAmount), amount(row.gatewayFee), amount(row.customerFee), amount(row.payoutFee),
    amount(row.netProfit), amount(row.payableAmount), row.payoutSources.join(" / ") || "Pending",
    row.payInAccount || "-",
  ]);
  const totals: string[] = [
    "TOTAL", ...(multiDay ? [""] : []), "", "", "", "",
    amount(summary.swipeAmount), amount(summary.gatewayFee), amount(summary.customerFee),
    amount(summary.payoutFee), amount(summary.netProfit), amount(summary.payableAmount), "", "",
  ];
  const displayedDate = indianDate(from) + (multiDay ? ` to ${indianDate(to)}` : "");
  const generated = timestampIST();
  const pagesToken = "{total_pages_count_string}";

  autoTable(pdf, {
    head: [headers],
    body: [...body, totals],
    startY: 43,
    margin: { top: 43, bottom: 17, left: 12, right: 12 },
    tableWidth: 396,
    theme: "grid",
    showHead: "everyPage",
    rowPageBreak: "avoid",
    pageBreak: "auto",
    horizontalPageBreak: false,
    styles: {
      font: "helvetica", fontSize: 7.8, textColor: rgb.navy, lineColor: rgb.line,
      lineWidth: 0.12, cellPadding: { top: 3.1, bottom: 3.1, left: 2.1, right: 2.1 },
      minCellHeight: 10.5, valign: "middle", overflow: "linebreak",
    },
    headStyles: {
      fillColor: rgb.gold, textColor: rgb.navy, fontStyle: "bold", fontSize: 7.5,
      minCellHeight: 12.5, valign: "middle", lineColor: [219, 186, 79], lineWidth: 0.1,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: columns,
    didParseCell: (cell) => {
      if (cell.section === "body" && cell.row.index === body.length) {
        cell.cell.styles.fillColor = rgb.green;
        cell.cell.styles.fontStyle = "bold";
        cell.cell.styles.textColor = [16, 91, 54];
        cell.cell.styles.minCellHeight = 12;
      } else if (cell.section === "body" && cell.column.index === numbersStart + 4) {
        cell.cell.styles.fontStyle = "bold";
      }
    },
    didDrawPage: () => {
      const page = pdf.getCurrentPageInfo().pageNumber;
      const width = pdf.internal.pageSize.getWidth();
      const height = pdf.internal.pageSize.getHeight();
      pdf.setFillColor(...rgb.navy);
      pdf.rect(0, 0, width, 11, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(15);
      pdf.setTextColor(...rgb.navy);
      pdf.text("CREDIT CARD SWIPE REPORT", 12, 20);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(...rgb.muted);
      pdf.text(`Business date: ${displayedDate}  |  ${rows.length} transaction${rows.length === 1 ? "" : "s"}`, 12, 27);
      pdf.text(`Generated: ${generated}`, width - 12, 27, { align: "right" });
      pdf.text("All amounts in INR  |  Card numbers masked  |  Net profit includes recorded payout fees", 12, 34);
      pdf.setDrawColor(...rgb.line);
      pdf.setLineWidth(0.25);
      pdf.line(12, 37, width - 12, 37);
      pdf.line(12, height - 13, width - 12, height - 13);
      pdf.setFontSize(8);
      pdf.text("Cash Ledger  |  Confidential business report", 12, height - 8);
      pdf.text(`Page ${page} of ${pagesToken}`, width - 12, height - 8, { align: "right" });
    },
  });
  if (typeof pdf.putTotalPages === "function") pdf.putTotalPages(pagesToken);
  pdf.save(`Credit_Card_Report_${indianDate(from)}_to_${indianDate(to)}.pdf`);
  return pdf;
}
