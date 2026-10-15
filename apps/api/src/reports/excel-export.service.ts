import { Injectable } from '@nestjs/common';
import { AccountType, EntryType, Prisma, TransactionStatus, TransactionType } from '@prisma/client';
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { asNumber, excelText, exportPeriod, sheetDate, signedAccountMovement, type ExportScope } from './excel-export.helpers.js';

type Column = [string, number, ('money' | 'date' | 'number' | 'text')?];
type Value = string | number | Date | null | undefined;
type Period = ReturnType<typeof exportPeriod>;
const BATCH = 500;
const ROW_LIMIT = 1_048_576;
const MONEY_FMT = '"₹"#,##0.00;[Red]("₹"#,##0.00)';
const transactionInclude = {
  customer: true,
  charges: true,
  commissions: true,
  cardSwipe: { include: { customerCard: true } },
  cashTransfer: true,
  quickCashTransfer: { include: { sourceAllocations: true } },
  aeps: true,
  microAtm: true,
  internalTransfer: true,
  expense: { include: { expenseCategory: true } },
  atmWithdrawal: true,
  creditCardPayment: true,
  accountEntry: true,
  customerLedgerEntry: { include: { allocations: true } },
  cardDueClearing: true,
  cardDueRecovery: true,
  cardDueCommissionCollection: true,
  payable: true,
  payablePayment: true,
  receivableSource: true,
  receivableCollection: true,
  providerSettlementSource: true,
  providerSettlementReceipt: true,
} as const satisfies Prisma.TransactionInclude;

class ExcelTab {
  private sheet: ReturnType<ExcelJS.stream.xlsx.WorkbookWriter['addWorksheet']>;
  private sheetNumber = 1;
  count = 0;
  constructor(
    private readonly book: ExcelJS.stream.xlsx.WorkbookWriter,
    private readonly title: string,
    private readonly columns: Column[],
  ) {
    this.sheet = this.startSheet();
  }
  private startSheet() {
    const name = this.sheetNumber === 1 ? this.title : this.title.slice(0, 27) + ' ' + this.sheetNumber;
    const sheet = this.book.addWorksheet(name, {
      views: [{ state: 'frozen', ySplit: 1 }],
      properties: { defaultRowHeight: 17 },
    });
    sheet.columns = this.columns.map(([header, width, kind]) => ({
      header, key: header, width,
      style: kind === 'money' ? { numFmt: MONEY_FMT } :
        kind === 'date' ? { numFmt: 'dd-mmm-yyyy hh:mm' } :
          kind === 'number' ? { numFmt: '#,##0.00' } : {},
    }));
    const heading = sheet.getRow(1);
    heading.height = 29;
    heading.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    heading.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF193456' } };
    heading.alignment = { vertical: 'middle', wrapText: true };
    heading.commit();
    sheet.autoFilter = { from: 'A1', to: { row: 1, column: this.columns.length } };
    return sheet;
  }
  add(...values: Value[]) {
    if (this.count > 0 && this.count % (ROW_LIMIT - 1) === 0) {
      this.sheet.commit();
      this.sheetNumber += 1;
      this.sheet = this.startSheet();
    }
    const row = values.map((value, i) => {
      if (value === null || value === undefined) return null;
      if (value instanceof Date) return value;
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      return excelText(value);
    });
    const written = this.sheet.addRow(row);
    if (this.count % 2 === 1) {
      written.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7FB' } };
    }
    written.commit();
    this.count += 1;
  }
  close() { this.sheet.commit(); }
}

type ExportTabs = Record<string, ExcelTab>;
type Names = { users: Map<string, string>; accounts: Map<string, string>; providers: Map<string, string>; gateways: Map<string, string> };
const validFinancialStatus = (status: TransactionStatus) =>
  status !== TransactionStatus.REVERSED && status !== TransactionStatus.CANCELLED && status !== TransactionStatus.FAILED;
const includeScope = (scope: ExportScope, category: ExportScope) => scope === 'all' || scope === category;

@Injectable()
export class ExcelExportService {
  constructor(private readonly prisma: PrismaService) {}

  async write(res: Response, from: string, to: string, scope = 'all', userId?: string) {
    const period = exportPeriod(from, to, scope);
    const generatedAt = new Date();
    const filename = 'CashLedger_' + from + '_to_' + to + '_' + period.scope + '.xlsx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.setHeader('Cache-Control', 'no-store');
    const book = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true, useSharedStrings: false });
    try {
      await this.prisma.$transaction(async (db) => {
        await this.populate(db, book, period, generatedAt);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 180_000, maxWait: 15_000 });
      await book.commit();
      if (userId) {
        await this.prisma.auditLog.create({ data: { userId, entityType:'ReportExport', entityId:'xlsx', action:'DOWNLOAD', newValues: {from,to,scope:period.scope,generatedAt:generatedAt.toISOString()} } }).catch(() => undefined);
      }
    } catch (error) {
      // A stream may have written headers already. Never send a corrupt workbook as a successful download.
      res.destroy(error instanceof Error ? error : new Error('Excel generation failed'));
      throw error;
    }
  }

  private async populate(
    db: Prisma.TransactionClient,
    book: ExcelJS.stream.xlsx.WorkbookWriter,
    period: Period,
    generatedAt: Date,
  ) {
    const tabs: ExportTabs = {};
    const sheet = (key: string, title: string, columns: Column[]) => {
      tabs[key] = new ExcelTab(book, title, columns);
    };
    sheet('summary', 'Summary', [['Metric', 39], ['Value', 29], ['Explanation', 90]]);
    if (period.scope === 'all') {
      sheet('master', 'Master Transactions', [
        ['Business Date', 24, 'date'], ['Transaction', 25], ['Type', 28], ['Status', 22],
        ['Customer', 29], ['Mobile', 20], ['Operator', 24], ['Principal / Gross', 20, 'money'],
        ['Net Amount', 20, 'money'], ['Commission Income', 20, 'money'],
        ['Service Revenue', 20, 'money'], ['Partner Cost', 20, 'money'],
        ['Other Charges', 20, 'money'], ['Recorded Profit', 20, 'money'],
        ['Reference', 32], ['Notes', 46], ['Entered At', 24, 'date'],
        ['Updated At', 24, 'date'], ['Transaction ID', 40],
      ]);
    }
    if (includeScope(period.scope, 'cash')) {
      sheet('cash', 'Daily Cash Book', [
        ['Posting Date', 24, 'date'], ['Drawer', 29], ['Transaction', 24],
        ['Category', 25], ['Customer', 26], ['Particulars', 55],
        ['Cash In', 18, 'money'], ['Cash Out', 18, 'money'], ['Running Balance', 20, 'money'],
        ['Entry Type', 14], ['Operator', 24], ['Status', 18], ['Transaction ID', 40],
      ]);
      sheet('sessions', 'Cash Sessions', [
        ['Business Date', 24, 'date'], ['Drawer', 29], ['Opened By', 26], ['Opened At', 24, 'date'],
        ['Opening', 18, 'money'], ['Expected Closing', 20, 'money'], ['Actual Closing', 20, 'money'],
        ['Difference', 18, 'money'], ['Closed By', 26], ['Closed At', 24, 'date'],
        ['Status', 18], ['Closing Notes', 45], ['Session ID', 40],
      ]);
      sheet('denominations', 'Cash Denominations', [
        ['Business Date', 24, 'date'], ['Session ID', 40], ['Drawer', 29], ['Count Type', 18],
        ['Denomination', 17, 'money'], ['Quantity', 14, 'number'], ['Total', 18, 'money'],
      ]);
      sheet('cashTransfer', 'Cash In Out', [
        ['Date', 24, 'date'], ['Transaction', 23], ['Direction', 15], ['Purpose', 22],
        ['Customer', 30], ['Mobile', 19], ['Principal', 19, 'money'], ['Cash Received', 19, 'money'],
        ['Change Returned', 19, 'money'], ['Commission', 19, 'money'], ['Commission Mode', 20],
        ['Cash Drawer', 28], ['Source Wallet / Bank', 31], ['Commission Account', 29],
        ['Beneficiary', 40], ['Payment Reference', 30], ['Status', 18],
        ['Completed At', 24, 'date'], ['Operator', 26], ['Transaction ID', 40],
      ]);
      sheet('allocations', 'Split Wallet Payouts', [
        ['Original Date', 24, 'date'], ['Transaction', 25], ['Customer', 30],
        ['Wallet', 30], ['Payout Amount', 20, 'money'], ['UTR / Reference', 30],
        ['Added At', 24, 'date'], ['Added By', 26], ['Source Allocation ID', 40],
      ]);
      sheet('transfers', 'Internal Transfers', [
        ['Date', 24, 'date'], ['Transaction', 23], ['From Account', 34], ['To Account', 34],
        ['Amount', 20, 'money'], ['Transfer Charges', 20, 'money'],
        ['Reference', 32], ['Operator', 25], ['Status', 20], ['Transaction ID', 40],
      ]);
    }
    if (includeScope(period.scope, 'card')) {
      sheet('swipes', 'Card Swipes', [
        ['Date', 24, 'date'], ['Transaction', 25], ['Customer', 30], ['Card Last Four', 20],
        ['Swipe Amount', 20, 'money'], ['Customer Fee', 20, 'money'],
        ['Transaction Gross', 20, 'money'], ['Gateway Charge', 20, 'money'],
        ['Settlement Amount', 20, 'money'], ['Provider', 27], ['Gateway', 27],
        ['Settlement Account', 30], ['Customer Payable', 20, 'money'],
        ['Paid So Far', 20, 'money'], ['Remaining', 20, 'money'],
        ['Due Date', 24, 'date'], ['Payout Status (Current)', 25],
        ['Transaction Status', 19], ['Operator', 25], ['Transaction ID', 40],
      ]);
      sheet('payouts', 'Customer Payouts', [
        ['Payment Date', 24, 'date'], ['Payout Transaction', 25], ['Original Swipe', 25],
        ['Customer', 30], ['Paid From', 32], ['Amount', 19, 'money'],
        ['Charges', 19, 'money'], ['Destination', 35], ['Reference', 30],
        ['Status', 19], ['Operator', 25], ['Transaction ID', 40],
      ]);
      sheet('cardDue', 'Card Dues', [
        ['Date', 24, 'date'], ['Transaction', 25], ['Customer', 30], ['Card Last Four', 20],
        ['Advance Source', 30], ['Due Principal', 19, 'money'],
        ['Recovered (Current)', 19, 'money'], ['Outstanding (Current)', 19, 'money'],
        ['Commission Due', 19, 'money'], ['Commission Collected', 19, 'money'],
        ['Commission Remaining', 19, 'money'], ['Next Follow-up', 24, 'date'],
        ['Reference', 32], ['Status', 19], ['Transaction ID', 40],
      ]);
      sheet('recoveries', 'Card Due Recoveries', [
        ['Recovery Date', 24, 'date'], ['Transaction', 25], ['Original Due Transaction', 28],
        ['Customer', 29], ['Swipe Amount', 20, 'money'], ['Gateway Fee', 20, 'money'],
        ['Recovered Principal', 20, 'money'], ['Provider', 27], ['Destination Wallet', 30],
        ['Reference', 30], ['Status', 20], ['Operator', 25],
      ]);
      sheet('dueCommissions', 'Card Due Commissions', [
        ['Collection Date', 24, 'date'], ['Transaction', 25], ['Original Due Transaction', 28],
        ['Customer', 29], ['Amount', 20, 'money'], ['Method', 20], ['Received Into', 30],
        ['Reference', 30], ['Status', 20], ['Operator', 25],
      ]);
    }
    if (includeScope(period.scope, 'income')) {
      sheet('services', 'Services', [
        ['Date', 24, 'date'], ['Transaction', 25], ['Service', 32], ['Customer', 30],
        ['Gross Revenue', 20, 'money'], ['Fulfilment', 20], ['Partner', 30],
        ['Partner Cost', 20, 'money'], ['Net Service Earning', 20, 'money'],
        ['Paid / Pay Later', 20], ['Partner Paid At', 24, 'date'],
        ['Received Via', 22], ['Receiving Account', 32], ['Operator', 26],
        ['Status', 20], ['Transaction ID', 40],
      ]);
      sheet('expenses', 'Expenses', [
        ['Date', 24, 'date'], ['Transaction', 25], ['Category', 30], ['Usage', 18],
        ['Amount', 20, 'money'], ['Paid From', 31], ['Payee', 30], ['Description', 50],
        ['Reference', 32], ['Operator', 27], ['Status', 20],
        ['Entered At', 24, 'date'], ['Transaction ID', 40],
      ]);
      sheet('commissions', 'Commissions', [
        ['Date', 24, 'date'], ['Transaction', 25], ['Category', 30], ['Customer', 29],
        ['Amount', 20, 'money'], ['Rate', 17, 'number'], ['Operator', 26],
        ['Status', 19], ['Transaction ID', 40],
      ]);
      sheet('charges', 'Fees and Costs', [
        ['Date', 24, 'date'], ['Transaction', 25], ['Charge Type', 32], ['Provider', 30],
        ['Amount', 20, 'money'], ['Rate', 17, 'number'], ['Source Account', 30],
        ['Notes', 43], ['Status', 20], ['Transaction ID', 40],
      ]);
      sheet('aeps', 'AEPS and Micro ATM', [
        ['Date', 24, 'date'], ['Transaction', 25], ['Type', 23], ['Customer', 30],
        ['Provider', 28], ['Gateway', 28], ['Principal', 20, 'money'],
        ['Cash Given', 20, 'money'], ['Customer Commission', 20, 'money'],
        ['Provider Fee', 20, 'money'], ['Provider Commission', 20, 'money'],
        ['Settlement', 20, 'money'], ['Cash Drawer', 29], ['Settlement Account', 29],
        ['Reference', 30], ['Status', 20], ['Operator', 25], ['Transaction ID', 40],
      ]);
    }
    if (includeScope(period.scope, 'accounts')) {
      sheet('balances', 'Account Balances', [
        ['Account', 32], ['Account Type', 24], ['Nature', 19],
        ['Opening Balance', 22, 'money'], ['Money In', 22, 'money'],
        ['Money Out', 22, 'money'], ['Closing Balance', 22, 'money'],
        ['Entries', 15, 'number'], ['Account ID', 40],
      ]);
      sheet('ledger', 'Account Ledgers', [
        ['Posting Date', 24, 'date'], ['Account', 32], ['Transaction', 24],
        ['Transaction Type', 25], ['Customer', 30], ['Particulars', 52],
        ['Money In', 20, 'money'], ['Money Out', 20, 'money'],
        ['Running Balance', 20, 'money'], ['Debit / Credit', 18],
        ['Operator', 25], ['Reference', 33], ['Transaction ID', 40],
      ]);
    }
    if (period.scope === 'all' || period.scope === 'card') {
      sheet('payables', 'Customer Payables', [
        ['Swipe Date', 24, 'date'], ['Swipe Transaction', 25], ['Customer', 29],
        ['Original Amount', 20, 'money'], ['Paid (Current)', 20, 'money'],
        ['Adjusted (Current)', 20, 'money'], ['Remaining (Current)', 20, 'money'],
        ['Due Date', 24, 'date'], ['Current Status', 25],
      ]);
      sheet('receivables', 'Customer Receivables', [
        ['Original Date', 24, 'date'], ['Transaction', 25], ['Customer', 29],
        ['Reason', 32], ['Category', 22], ['Amount', 20, 'money'],
        ['Received (Current)', 20, 'money'], ['Remaining (Current)', 20, 'money'],
        ['Due Date', 24, 'date'], ['Status', 23],
      ]);
      sheet('collections', 'Customer Collections', [
        ['Collected At', 24, 'date'], ['Receipt Transaction', 25], ['Original Transaction', 25],
        ['Customer', 30], ['Received In', 30], ['Amount', 20, 'money'],
        ['Reference', 32], ['Status', 22], ['Operator', 26],
      ]);
      sheet('customerMovements', 'Customer Pay In Out', [
        ['Date', 24, 'date'], ['Transaction', 25], ['Direction', 20],
        ['Customer', 30], ['Account', 30], ['Amount', 20, 'money'],
        ['Receivable', 20, 'money'], ['Payable', 20, 'money'],
        ['Advance Offset', 20, 'money'], ['Allocated To', 52],
        ['Reference', 32], ['Status', 19], ['Operator', 25],
      ]);
    }
    if (period.scope === 'all') {
      sheet('eod', 'End of Day', [
        ['Business Date', 24, 'date'], ['Liquid Funds', 20, 'money'], ['Provider Clearing', 20, 'money'],
        ['Customer Receivables', 22, 'money'], ['Customer Payables', 22, 'money'],
        ['Operating Position', 21, 'money'], ['Owner Card Outstanding', 22, 'money'],
        ['Net Position', 22, 'money'], ['Cash Difference', 20, 'money'],
        ['Recorded By', 28], ['Recorded At', 24, 'date'],
      ]);
      sheet('provider', 'Provider Settlements', [
        ['Source Date', 24, 'date'], ['Source Transaction', 27], ['Provider', 28],
        ['Gateway', 28], ['Expected', 20, 'money'], ['Received (Current)', 20, 'money'],
        ['Outstanding (Current)', 20, 'money'], ['Destination', 32],
        ['Due Date', 24, 'date'], ['Current Status', 22],
      ]);
      sheet('providerReceipts', 'Provider Receipts', [
        ['Received At', 24, 'date'], ['Receipt Transaction', 25], ['Source Transaction', 25],
        ['Provider', 29], ['Receiving Account', 31], ['Amount', 20, 'money'],
        ['Reference', 30], ['Status', 18],
      ]);
      sheet('pending', 'Pending Transactions', [
        ['Original Date', 24, 'date'], ['Transaction', 25], ['Type', 26],
        ['Customer', 29], ['Mobile', 20], ['Amount', 20, 'money'],
        ['Commission', 20, 'money'], ['Missing / Notes', 48],
        ['Status', 20], ['Entered By', 25], ['Entered At', 24, 'date'], ['Transaction ID', 40],
      ]);
      sheet('customers', 'New Customers', [
        ['Added At', 24, 'date'], ['Customer Code', 25], ['Customer', 32],
        ['Mobile', 22], ['Type', 20], ['Status', 18], ['Customer ID', 40],
      ]);
      sheet('audit', 'Audit and Corrections', [
        ['Changed At', 24, 'date'], ['User', 28], ['Entity Type', 24],
        ['Entity ID', 42], ['Action', 24], ['Reason', 46],
        ['Previous Values JSON', 85], ['New Values JSON', 85],
      ]);
    }

    const [users, accounts, providers, gateways] = await Promise.all([
      db.user.findMany({ select: { id: true, fullName: true } }),
      db.financialAccount.findMany({ select: { id: true, accountName: true, accountType: true, accountNature: true, openingBalance: true, createdAt: true, ledgerAccount: { select: { id: true } } } }),
      db.provider.findMany({ select: { id: true, name: true } }),
      db.providerGateway.findMany({ select: { id: true, gatewayName: true } }),
    ]);
    const names: Names = {
      users: new Map(users.map(u => [u.id, u.fullName])),
      accounts: new Map(accounts.map(a => [a.id, a.accountName])),
      providers: new Map(providers.map(p => [p.id, p.name])),
      gateways: new Map(gateways.map(g => [g.id, g.gatewayName])),
    };
    const user = (id?: string | null) => id ? names.users.get(id) ?? id : '';
    const account = (id?: string | null) => id ? names.accounts.get(id) ?? id : '';
    const provider = (id?: string | null) => id ? names.providers.get(id) ?? id : '';
    const gateway = (id?: string | null) => id ? names.gateways.get(id) ?? id : '';
    const totals = { transactions: 0, principal: 0, commissions: 0, serviceRevenue: 0, partnerCost: 0, otherCharges: 0, expenses: 0, active: 0 };
    const byDay = new Map<string, {count:number, commissions:number, services:number, charges:number, expenses:number}>();
    let cursor: string | undefined;
    do {
      const rows = await db.transaction.findMany({
        where: { transactionAt: { gte: period.start, lt: period.end } },
        include: transactionInclude,
        orderBy: [{ transactionAt: 'asc' }, { id: 'asc' }],
        take: BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!rows.length) break;
      for (const t of rows) {
        const valid = validFinancialStatus(t.status);
        const commission = t.commissions.reduce((sum,c) => sum + asNumber(c.amount), 0);
        const partner = t.charges.filter(c => c.chargeType === 'SERVICE_PARTNER_COST').reduce((sum,c) => sum + asNumber(c.amount), 0);
        const fees = t.charges.filter(c => c.chargeType !== 'SERVICE_PARTNER_COST').reduce((sum,c) => sum + asNumber(c.amount), 0);
        const serviceRevenue = t.transactionType === TransactionType.SERVICE_INCOME ? asNumber(t.grossAmount) : 0;
        const customer = t.customer?.fullName ?? t.quickCashTransfer?.customerName ?? '';
        const mobile = t.customer?.mobile ?? t.quickCashTransfer?.mobileNumber ?? '';
        const date = sheetDate(t.transactionAt);
        const timestamp = new Date(t.transactionAt.getTime() + 330 * 60_000).toISOString().slice(0,10);
        const daily = byDay.get(timestamp) ?? { count:0, commissions:0, services:0, charges:0, expenses:0 };
        daily.count++;
        totals.transactions++;
        if (valid) {
          totals.active++;
          totals.principal += asNumber(t.grossAmount);
          totals.commissions += commission;
          totals.serviceRevenue += serviceRevenue;
          totals.partnerCost += partner;
          totals.otherCharges += fees;
          if (t.expense) totals.expenses += asNumber(t.expense.amount);
          daily.commissions += commission;
          daily.services += serviceRevenue;
          daily.charges += partner + fees;
          if (t.expense) daily.expenses += asNumber(t.expense.amount);
        }
        byDay.set(timestamp, daily);
        tabs.master?.add(date, t.transactionNumber, t.transactionType, t.status, customer, mobile, user(t.createdById),
          asNumber(t.grossAmount), t.netAmount === null ? null : asNumber(t.netAmount), commission, serviceRevenue,
          partner, fees, valid ? commission + serviceRevenue - partner - fees : 0,
          t.referenceNumber, t.notes, sheetDate(t.createdAt), sheetDate(t.updatedAt), t.id);
        for (const c of t.commissions) tabs.commissions?.add(date,t.transactionNumber,c.commissionType,customer,asNumber(c.amount),asNumber(c.rate),user(t.createdById),t.status,t.id);
        for (const c of t.charges) tabs.charges?.add(date,t.transactionNumber,c.chargeType,provider(c.providerId),asNumber(c.amount),asNumber(c.rate),account(c.sourceAccountId),c.notes,t.status,t.id);
        if (t.cardSwipe) {
          const d = t.cardSwipe;
          tabs.swipes?.add(date,t.transactionNumber,customer,d.customerCard?.lastFourDigits,
            asNumber(d.swipeAmount),asNumber(d.commissionAmount),asNumber(t.grossAmount),
            asNumber(d.providerChargeAmount),asNumber(d.settlementAmount),provider(d.providerId),
            gateway(d.gatewayId),account(d.settlementAccountId),asNumber(d.customerPayableAmount),
            asNumber(t.payable?.paidAmount),asNumber(t.payable?.remainingAmount),
            sheetDate(d.dueAt),t.payable?.status ?? '',t.status,user(t.createdById),t.id);
        }
        if (t.cardDueClearing) {
          const d = t.cardDueClearing;
          tabs.cardDue?.add(date,t.transactionNumber,customer,d.customerCardId,account(d.advanceSourceAccountId),
            asNumber(d.dueAmount),asNumber(d.principalRecovered),asNumber(d.principalRemaining),
            asNumber(d.commissionAmount),asNumber(d.commissionCollected),asNumber(d.commissionRemaining),
            sheetDate(d.nextFollowUpAt),d.duePaymentReference,t.status,t.id);
        }
        if (t.quickCashTransfer || t.cashTransfer) {
          const d = t.quickCashTransfer;
          const x = t.cashTransfer;
          tabs.cashTransfer?.add(date,t.transactionNumber,d?.direction ?? 'IN',d?.purpose ?? 'TRANSFER',customer,mobile,
            d ? asNumber(d.amount) : asNumber(x?.requestedAmount),
            d ? asNumber(d.cashReceivedAmount ?? d.amount) : asNumber(x?.cashReceived),
            asNumber(d?.customerChangeAmount),d ? asNumber(d.commissionAmount) : asNumber(x?.commissionAmount),
            d?.commissionMode ?? x?.commissionMethod,account(d?.cashAccountId ?? x?.cashAccountId),
            account(d?.sourceAccountId ?? x?.sourceAccountId),account(d?.commissionAccountId),
            d?.beneficiaryDetails ?? x?.beneficiaryId, x?.transferReference ?? t.referenceNumber,
            t.status,sheetDate(d?.completedAt),user(t.createdById),t.id);
          if (d) for (const a of d.sourceAllocations) {
            tabs.allocations?.add(date,t.transactionNumber,customer,account(a.sourceAccountId),
              asNumber(a.amount),a.referenceNumber,sheetDate(a.createdAt),user(a.createdById),a.id);
          }
        }
        if (t.transactionType === TransactionType.SERVICE_INCOME) {
          const d = t.quickCashTransfer;
          const cost = asNumber(d?.servicePartnerCharge);
          tabs.services?.add(date,t.transactionNumber,d?.serviceName ?? t.notes,customer,
            serviceRevenue,d?.serviceFulfillmentMode ?? 'INTERNAL',d?.servicePartnerName,cost,
            serviceRevenue-cost,d?.servicePartnerPaymentTiming,sheetDate(d?.servicePartnerPaidAt),
            d?.servicePaymentMode,account(d?.servicePaymentAccountId ?? d?.cashAccountId),
            user(t.createdById),t.status,t.id);
        }
        if (t.expense) {
          const d = t.expense;
          tabs.expenses?.add(date,t.transactionNumber,d.expenseCategory.name,d.expenseType,
            asNumber(d.amount),account(d.paymentAccountId),d.payee,d.description,t.referenceNumber,
            user(t.createdById),t.status,sheetDate(t.createdAt),t.id);
        }
        if (t.aeps || t.microAtm) {
          const d = t.aeps;
          const x = t.microAtm;
          tabs.aeps?.add(date,t.transactionNumber,t.transactionType,customer,provider(d?.providerId ?? x?.providerId),
            gateway(d?.gatewayId ?? x?.gatewayId),asNumber(d?.withdrawalAmount ?? x?.withdrawalAmount),
            asNumber(d?.cashGiven ?? x?.cashGiven),asNumber(d?.commissionAmount),
            asNumber(d?.platformChargeAmount),asNumber(d?.providerCommissionAmount ?? x?.providerCommissionAmount),
            asNumber(d?.settlementAmount ?? x?.settlementAmount),account(d?.cashAccountId ?? x?.cashAccountId),
            account(d?.settlementAccountId ?? x?.settlementAccountId),d?.providerReference ?? x?.providerReference,
            t.status,user(t.createdById),t.id);
        }
        if (t.internalTransfer) {
          const d = t.internalTransfer;
          tabs.transfers?.add(date,t.transactionNumber,account(d.sourceAccountId),account(d.destinationAccountId),
            asNumber(d.transferAmount),asNumber(d.chargeAmount),d.referenceNumber,user(t.createdById),t.status,t.id);
        }
        if (t.customerLedgerEntry) {
          const d = t.customerLedgerEntry;
          tabs.customerMovements?.add(date,t.transactionNumber,d.direction,customer,account(d.financialAccountId),
            asNumber(d.amount),asNumber(d.receivableAmount),asNumber(d.payableAmount),
            asNumber(d.advanceAppliedAmount),
            d.allocations.map(a => a.targetType + ': ' + asNumber(a.amount)).join(' | '),
            t.referenceNumber,t.status,user(t.createdById));
        }
        if (t.status === TransactionStatus.PENDING || (t.quickCashTransfer && !t.quickCashTransfer.completedAt)) {
          tabs.pending?.add(date,t.transactionNumber,t.transactionType,customer,mobile,
            asNumber(t.grossAmount),asNumber(t.quickCashTransfer?.commissionAmount),
            t.notes,t.status,user(t.createdById),sheetDate(t.createdAt),t.id);
        }
      }
      cursor = rows[rows.length-1].id;
      if (rows.length < BATCH) break;
    } while (true);

    // Financial movement date, rather than source transaction date, determines which period receives the movement.
    await this.writeMovements(db, period, tabs, names, accounts);
    await this.writeOperational(db, period, tabs, names);
    tabs.summary.add('Export period', period.from + ' to ' + period.to, 'Both selected dates are included, using Asia/Kolkata business time.');
    tabs.summary.add('Generated at (India)', new Intl.DateTimeFormat('en-IN', {timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'medium'}).format(generatedAt), 'Balances and obligation statuses are current at export time, not historical as-of-period snapshots.');
    tabs.summary.add('Export category', period.scope, 'Separate worksheets hold transaction details and cash/account movements.');
    tabs.summary.add('Original transactions', totals.transactions, 'Includes pending, cancelled and reversed records for auditability.');
    tabs.summary.add('Non-cancelled/reversed transactions', totals.active, 'Excludes failed, cancelled and reversed source transactions.');
    tabs.summary.add('Recorded commission income', totals.commissions, 'Original transaction date; excludes failed, cancelled and reversed records.');
    tabs.summary.add('Gross service revenue', totals.serviceRevenue, 'Customer service charges; excludes failed, cancelled and reversed records.');
    tabs.summary.add('External partner service cost', totals.partnerCost, 'Partner costs are separately recorded as charges, including pay-later amounts.');
    tabs.summary.add('Other provider and bank fees', totals.otherCharges, 'Excludes partner costs already counted above.');
    tabs.summary.add('Recorded gross margin', totals.commissions + totals.serviceRevenue - totals.partnerCost - totals.otherCharges,
      'Recorded transaction income minus related provider/partner charges; excludes general expenses.');
    tabs.summary.add('Business and personal expenses', totals.expenses, 'Includes both classifications; not subtracted from gross margin above.');
    tabs.summary.add('Important accounting rule', 'Principal is NOT income', 'UPI, cash transfers, card swipes and ATM withdrawal principal must never be added to commission/service revenue.');
    tabs.summary.add('Important date rule', 'Different event dates', 'Original entries use transaction date; ledger movements use journal posting date; payouts and receipts use payment date.');
    tabs.summary.add('Status rule', 'Current status', 'Current unpaid amounts/status may include activity after the selected date range. Payment sheets are date-scoped.');
    tabs.summary.add('Reversals and corrections', 'Retained', 'Reversed transactions stay in detail worksheets; financial totals exclude reversed sources. Audit actions are filtered by change date.');
    tabs.summary.add('Access', 'Owner / Admin', 'Contains financial and potentially personal customer data. Do not share outside authorized users.');
    tabs.summary.add('Workbook sheets', Object.keys(tabs).length + 1, 'Each sheet contains row headings even where the period has no activity.');
    for (const [key, tab] of Object.entries(tabs)) {
      if (key !== 'summary') tabs.summary.add('Rows: ' + key, tab.count, 'Excludes headings; split sheets may continue at Excel row limits.');
    }
    tabs.summary.add('Rows: daily', byDay.size, 'Daily groupings from original transactions.');
    sheet('daily', 'Daily Summary', [
      ['Business Date (UTC key)', 26], ['Transactions', 17, 'number'],
      ['Commission', 19, 'money'], ['Service Revenue', 20, 'money'],
      ['Costs and Fees', 20, 'money'], ['Expenses', 20, 'money'],
      ['Recorded Margin', 21, 'money'],
    ]);
    for (const [day, totals] of [...byDay].sort(([a],[b]) => a.localeCompare(b))) {
      tabs.daily.add(day,totals.count,totals.commissions,totals.services,totals.charges,
        totals.expenses,totals.commissions+totals.services-totals.charges);
    }
    for (const tab of Object.values(tabs)) tab.close();
  }

  private async writeMovements(
    db: Prisma.TransactionClient,
    period: Period,
    tabs: ExportTabs,
    names: Names,
    accounts: {
      id: string; accountName: string; accountType: AccountType; accountNature: Prisma.FinancialAccountGetPayload<object>['accountNature'];
      openingBalance: Prisma.Decimal; createdAt: Date; ledgerAccount: {id: string} | null;
    }[],
  ) {
    if (!tabs.ledger && !tabs.cash) return;
    const relevant = accounts.filter(a => a.ledgerAccount && a.createdAt < period.end);
    const ledgerToAccount = new Map(relevant.map(a => [a.ledgerAccount!.id, a]));
    const prior = await db.ledgerEntry.groupBy({
      by: ['ledgerAccountId','entryType'],
      where: {
        ledgerAccountId: { in: [...ledgerToAccount.keys()] },
        journal: { status: 'POSTED', postingDate: { lt: period.start } },
      },
      _sum: { amount: true },
    });
    const initial = new Map<string, number>();
    for (const a of relevant) {
      initial.set(a.id, a.createdAt < period.start ? asNumber(a.openingBalance) : 0);
    }
    for (const p of prior) {
      const a = ledgerToAccount.get(p.ledgerAccountId);
      if (a) initial.set(a.id, (initial.get(a.id) ?? 0) +
        signedAccountMovement(a.accountNature,p.entryType,asNumber(p._sum.amount)));
    }
    const running = new Map(initial);
    const incoming = new Map<string,number>(), outgoing = new Map<string,number>(), counts = new Map<string,number>();
    const introduced = new Set<string>();
    const originalOpening = (a: typeof relevant[number]) => {
      if (a.createdAt < period.start || introduced.has(a.id)) return;
      introduced.add(a.id);
      const opening = asNumber(a.openingBalance);
      running.set(a.id,(running.get(a.id) ?? 0)+opening);
      incoming.set(a.id,(incoming.get(a.id) ?? 0)+opening);
      if (opening === 0) return;
      const v: Value[] = [sheetDate(a.createdAt),a.accountName,'Opening', 'Account Opening','',
        'Opening balance introduced',opening,0,running.get(a.id) ?? 0,'OPENING','','',a.id];
      tabs.ledger?.add(...v);
      if (a.accountType === AccountType.CASH) {
        tabs.cash?.add(sheetDate(a.createdAt),a.accountName,'Opening','Account Opening','',
          'Opening balance introduced',opening,0,running.get(a.id) ?? 0,'OPENING','','',a.id);
      }
    };
    let cursor: string | undefined;
    do {
      const entries = await db.ledgerEntry.findMany({
        where: {
          ledgerAccountId: { in: [...ledgerToAccount.keys()] },
          journal: { status: 'POSTED', postingDate: { gte: period.start, lt: period.end } },
        },
        include: { journal: { include: { transaction: { include: { customer: true } } } } },
        orderBy: [{ ledgerAccountId:'asc' }, { journal: { postingDate:'asc' } }, { id:'asc' }],
        take: BATCH,
        ...(cursor ? { cursor:{ id:cursor }, skip:1 } : {}),
      });
      if (!entries.length) break;
      for (const e of entries) {
        const a = ledgerToAccount.get(e.ledgerAccountId);
        if (!a) continue;
        originalOpening(a);
        const signed = signedAccountMovement(a.accountNature,e.entryType,asNumber(e.amount));
        const moneyIn = signed > 0 ? signed : 0;
        const moneyOut = signed < 0 ? -signed : 0;
        const next = (running.get(a.id) ?? 0) + signed;
        running.set(a.id,next);
        incoming.set(a.id,(incoming.get(a.id) ?? 0)+moneyIn);
        outgoing.set(a.id,(outgoing.get(a.id) ?? 0)+moneyOut);
        counts.set(a.id,(counts.get(a.id) ?? 0)+1);
        const tx = e.journal.transaction;
        tabs.ledger?.add(sheetDate(e.journal.postingDate),a.accountName,tx.transactionNumber,tx.transactionType,
          tx.customer?.fullName,e.description ?? e.journal.description,moneyIn,moneyOut,next,
          e.entryType,names.users.get(tx.createdById),tx.referenceNumber,tx.id);
        if (a.accountType === AccountType.CASH) {
          tabs.cash?.add(sheetDate(e.journal.postingDate),a.accountName,tx.transactionNumber,tx.transactionType,
            tx.customer?.fullName,e.description ?? e.journal.description,moneyIn,moneyOut,next,
            e.entryType,names.users.get(tx.createdById),tx.status,tx.id);
        }
      }
      cursor=entries[entries.length-1].id;
      if (entries.length < BATCH) break;
    } while (true);
    for (const a of relevant) {
      originalOpening(a);
      const open = initial.get(a.id) ?? 0;
      const moneyIn = incoming.get(a.id) ?? 0;
      const moneyOut = outgoing.get(a.id) ?? 0;
      tabs.balances?.add(a.accountName,a.accountType,a.accountNature,
        open,moneyIn,moneyOut,open+moneyIn-moneyOut,counts.get(a.id) ?? 0,a.id);
    }
  }

  private async writeOperational(db: Prisma.TransactionClient, period: Period, tabs: ExportTabs, names: Names) {
    const dates = { gte: period.start, lt: period.end };
    const days = { gte: period.dayStart, lt: period.dayEnd };
    const user = (id: string | null | undefined) => (id ? names.users.get(id) ?? id : '');
    const account = (id: string | null | undefined) => (id ? names.accounts.get(id) ?? id : '');
    const provider = (id: string | null | undefined) => (id ? names.providers.get(id) ?? id : '');
    const gateway = (id: string | null | undefined) => (id ? names.gateways.get(id) ?? id : '');

    if (tabs.sessions) {
      const sessions = await db.cashSession.findMany({
        where: { businessDate: days },
        include: { denominationCounts: true },
        orderBy: [{businessDate:'asc'},{openedAt:'asc'}],
      });
      for (const s of sessions) {
        tabs.sessions.add(sheetDate(s.businessDate),account(s.cashAccountId),user(s.openedById),sheetDate(s.openedAt),
          asNumber(s.openingTotal),asNumber(s.expectedClosingTotal),asNumber(s.actualClosingTotal),
          s.differenceAmount === null ? null : asNumber(s.differenceAmount),
          user(s.closedById),sheetDate(s.closedAt),s.status,s.closingNotes,s.id);
        for (const d of s.denominationCounts) {
          tabs.denominations?.add(sheetDate(s.businessDate),s.id,account(s.cashAccountId),
            d.countType,asNumber(d.denomination),d.quantity,asNumber(d.totalAmount));
        }
      }
    }

    if (tabs.payouts) {
      const payouts = await db.payablePayment.findMany({
        where: { paymentDate: dates },
        include: { transaction: { include: { charges: true } },
          payable: { include: { sourceTransaction: { include: { customer: true } } } } },
        orderBy: { paymentDate:'asc' },
      });
      for (const p of payouts) {
        const original = p.payable.sourceTransaction;
        const fees = p.transaction.charges.reduce((sum,c)=>sum+asNumber(c.amount),0);
        tabs.payouts.add(sheetDate(p.paymentDate),p.transaction.transactionNumber,original.transactionNumber,
          original.customer?.fullName,account(p.sourceAccountId),asNumber(p.amount),fees,
          p.destinationLabel ?? p.destinationType,p.referenceNumber,p.status,
          user(p.createdById),p.transactionId);
      }
    }
    if (tabs.recoveries) {
      const recoveries = await db.cardDueRecovery.findMany({
        where: { recoveredAt: dates },
        include: { transaction: true,
          clearing: { include: { transaction: { include: { customer: true } } } } },
        orderBy: {recoveredAt:'asc'},
      });
      for (const r of recoveries) {
        tabs.recoveries.add(sheetDate(r.recoveredAt),r.transaction.transactionNumber,
          r.clearing.transaction.transactionNumber,r.clearing.transaction.customer?.fullName,
          asNumber(r.swipeAmount),asNumber(r.providerChargeAmount),
          asNumber(r.swipeAmount)-asNumber(r.providerChargeAmount),provider(r.providerId),
          account(r.destinationAccountId),r.referenceNumber,r.transaction.status,user(r.createdById));
      }
    }
    if (tabs.dueCommissions) {
      const collections = await db.cardDueCommissionCollection.findMany({
        where: { collectedAt: dates },
        include: {transaction:true,
          clearing: { include: { transaction: { include: {customer:true} } } } },
        orderBy: {collectedAt:'asc'},
      });
      for (const c of collections) {
        tabs.dueCommissions.add(sheetDate(c.collectedAt),c.transaction.transactionNumber,
          c.clearing.transaction.transactionNumber,c.clearing.transaction.customer?.fullName,
          asNumber(c.amount),c.paymentMode,account(c.destinationAccountId),
          c.referenceNumber,c.transaction.status,user(c.createdById));
      }
    }

    if (tabs.payables) {
      const payables = await db.customerPayable.findMany({
        where: {sourceTransaction: {transactionAt: dates}},
        include: { customer:true,sourceTransaction:true }, orderBy: {sourceTransaction:{transactionAt:'asc'}},
      });
      for (const p of payables) {
        tabs.payables.add(sheetDate(p.sourceTransaction.transactionAt),p.sourceTransaction.transactionNumber,
          p.customer.fullName,asNumber(p.originalAmount),asNumber(p.paidAmount),
          asNumber(p.offsetAmount),asNumber(p.remainingAmount),sheetDate(p.dueAt),p.status);
      }
    }
    if (tabs.receivables) {
      const receivables = await db.customerReceivable.findMany({
        where: {sourceTransaction:{transactionAt:dates}},
        include: {customer:true,sourceTransaction:true},orderBy: {sourceTransaction:{transactionAt:'asc'}},
      });
      for (const r of receivables) {
        tabs.receivables.add(sheetDate(r.sourceTransaction.transactionAt),r.sourceTransaction.transactionNumber,
          r.customer.fullName,r.reason,r.reasonCategory,asNumber(r.originalAmount),asNumber(r.receivedAmount),
          asNumber(r.remainingAmount),sheetDate(r.dueAt),r.status);
      }
    }
    if (tabs.collections) {
      const collections = await db.receivableCollection.findMany({
        where: {collectionDate:dates},
        include: {transaction:true,receivable:{include:{customer:true,sourceTransaction:true}}},
        orderBy: {collectionDate:'asc'},
      });
      for (const c of collections) {
        tabs.collections.add(sheetDate(c.collectionDate),c.transaction.transactionNumber,
          c.receivable.sourceTransaction.transactionNumber,c.receivable.customer.fullName,
          account(c.destinationAccountId),asNumber(c.amount),c.referenceNumber,c.status,user(c.createdById));
      }
    }
    if (tabs.eod) {
      const snapshots = await db.dailyPositionSummary.findMany({where:{businessDate:days},orderBy:{businessDate:'asc'}});
      for (const s of snapshots) {
        tabs.eod.add(sheetDate(s.businessDate),asNumber(s.availableFunds),asNumber(s.pendingProviderSettlements),
          asNumber(s.customerReceivable),asNumber(s.customerPayable),asNumber(s.operatingPosition),
          asNumber(s.ownerCreditCardOutstanding),asNumber(s.netFinancialPosition),
          asNumber(s.cashVariance),user(s.createdById),sheetDate(s.createdAt));
      }
    }
    if (tabs.provider) {
      const settlements = await db.providerSettlement.findMany({
        where: {sourceTransaction:{transactionAt:dates}},
        include: {sourceTransaction:true},
        orderBy: {sourceTransaction:{transactionAt:'asc'}},
      });
      for (const s of settlements) {
        tabs.provider.add(sheetDate(s.sourceTransaction.transactionAt),s.sourceTransaction.transactionNumber,
          provider(s.providerId),gateway(s.gatewayId),asNumber(s.expectedAmount),asNumber(s.receivedAmount),
          asNumber(s.remainingAmount),account(s.destinationAccountId),sheetDate(s.dueAt),s.status);
      }
    }
    if (tabs.providerReceipts) {
      const receipts = await db.providerSettlementReceipt.findMany({
        where: {receivedAt:dates},
        include: {transaction:true,settlement:{include:{sourceTransaction:true}}},
        orderBy: {receivedAt:'asc'},
      });
      for (const r of receipts) {
        tabs.providerReceipts.add(sheetDate(r.receivedAt),r.transaction.transactionNumber,
          r.settlement.sourceTransaction.transactionNumber,provider(r.settlement.providerId),
          account(r.destinationAccountId),asNumber(r.amount),r.referenceNumber,r.status);
      }
    }
    if (tabs.customers) {
      const customers = await db.customer.findMany({
        where: {createdAt:dates},orderBy: {createdAt:'asc'},
        select: {id:true,customerCode:true,fullName:true,mobile:true,customerType:true,isActive:true,createdAt:true},
      });
      for (const c of customers) {
        tabs.customers.add(sheetDate(c.createdAt),c.customerCode,c.fullName,c.mobile,c.customerType,
          c.isActive?'Active':'Inactive',c.id);
      }
    }
    if (tabs.audit) {
      const logs = await db.auditLog.findMany({ where:{createdAt:dates},orderBy:{createdAt:'asc'} });
      const jsonText = (value: Prisma.JsonValue | null) => {
        if (value === null) return '';
        const serialized = JSON.stringify(value);
        return serialized.length > 32000
          ? serialized.slice(0,31960) + ' [TRUNCATED: see application audit record]'
          : serialized;
      };
      for (const log of logs) {
        tabs.audit.add(sheetDate(log.createdAt),user(log.userId),log.entityType,log.entityId,
          log.action,log.reason,jsonText(log.oldValues),jsonText(log.newValues));
      }
    }
  }
}
