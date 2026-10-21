import { Body, Controller, Get, Headers, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import { PayableStatus, RoleName, TransactionType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CreatePayablePaymentDto } from './dto/create-payable-payment.dto.js';
import { CreateAdvanceOffsetDto } from './dto/create-advance-offset.dto.js';
import { CancelPayableDto } from './dto/cancel-payable.dto.js';
import { PayablesService } from './payables.service.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payables')
export class PayablesController {
  constructor(private readonly payables: PayablesService) {}

  @Get('due-report')
  dueReport(
    @Query('q') q?: string,
    @Query('transactionType') transactionType?: TransactionType,
  ) {
    return this.payables.dueReport({ q, transactionType });
  }

  @Get('due-report/excel')
  async downloadDueReport(
    @Res() response: Response,
    @Query('q') q?: string,
    @Query('transactionType') transactionType?: TransactionType,
  ) {
    const report = await this.payables.dueReport({ q, transactionType });
    const book = new ExcelJS.Workbook();
    book.creator = 'Cash Ledger';
    book.subject = 'Outstanding customer payments, grouped by due date';
    const currency = '"₹"#,##0.00;[Red]("₹"#,##0.00)';
    const safe = (value: string) => /^[=+@\-\t\r]/.test(value) ? "'" + value : value;
    const date = (value: string) => new Date(value + 'T12:00:00Z');
    const addSheet = (name: string, headers: string[], widths: number[],
      data: (string | number | Date)[][], monetary: number[], dateColumns: number[]) => {
      const sheet = book.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
      sheet.columns = headers.map((header, i) => ({ header, key: String(i), width: widths[i] ?? 16 }));
      sheet.autoFilter = { from: 'A1', to: { row: 1, column: headers.length } };
      const header = sheet.getRow(1);
      header.height = 30;
      header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF193456' } };
      header.alignment = { vertical: 'middle', wrapText: true };
      for (const [index, cells] of data.entries()) {
        const row = sheet.addRow(cells.map(cell => typeof cell === 'string' ? safe(cell) : cell));
        if (index % 2 === 1) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F6FB' } };
      }
      for (const column of monetary) sheet.getColumn(column).numFmt = currency;
      for (const column of dateColumns) sheet.getColumn(column).numFmt = 'dd-mmm-yyyy';
      return sheet;
    };

    addSheet('Date Wise Summary',
      ['Due date','State','Customers','Cards','Entries','Gross swipe','Customer service charge','Net customer payable','Already paid','Advance applied','Still to pay'],
      [19,16,15,13,13,19,24,24,19,19,22],
      report.dates.map(g => [
        date(g.date),g.status,g.customerCount,g.cardCount,g.itemCount,
        g.grossSwipe,g.customerCharges,g.netPayable,g.paid,g.advance,g.remaining,
      ]),
      [6,7,8,9,10,11],[1]);

    addSheet('Pending Details',
      ['Due date','Swipe date','Customer','Mobile','Card','Transaction','Service','Payment term','Gross swipe','Customer fee %','Customer service charge','Net payable','Paid','Advance','Still to pay','Gateway charge (business cost)','Due status'],
      [19,19,29,19,27,22,20,18,18,18,24,21,19,18,21,28,17],
      report.rows.map(r => [
        date(r.dueDate), date(r.swipeDate),r.customer,r.mobile,r.card,
        r.transactionNumber,r.service,r.term,r.grossSwipe,r.customerRate ?? 0,
        r.customerCharges,r.netPayable,r.paid,r.advance,r.remaining,r.gatewayCharge,r.status,
      ]),
      [9,11,12,13,14,15,16],[1,2]);

    addSheet('Customer Card Totals',
      ['Customer','Mobile','Card','Earliest due','Pending swipes','Gross swipe','Service charges','Net payable','Paid','Advance','Outstanding'],
      [29,18,28,19,19,19,21,21,18,18,22],
      report.cards.map(c => [
        c.customer,c.mobile,c.card,date(c.earliestDue),c.swipeCount,c.grossSwipe,
        c.customerCharges,c.netPayable,c.paid,c.advance,c.remaining,
      ]),
      [6,7,8,9,10,11],[4]);

    response.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition',
      'attachment; filename="CashLedger_Pending_Payables_' + report.businessDate + '.xlsx"');
    response.setHeader('Cache-Control','no-store');
    const buffer = await book.xlsx.writeBuffer();
    response.end(Buffer.from(buffer));
  }

  @Get()
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
    @Query('status') status?: PayableStatus,
    @Query('transactionType') transactionType?: TransactionType,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('openOnly') openOnly?: string,
    @Query('dueDate') dueDate?: string,
  ) {
    return this.payables.list({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      q,
      status,
      transactionType,
      sortBy,
      sortDir,
      openOnly: openOnly === 'true',
      dueDate,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.payables.get(id);
  }

  @Post(':id/payments')
  pay(
    @Param('id') id: string,
    @Body() dto: CreatePayablePaymentDto,
    @Req() req: any,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.payables.pay(id, dto, req.user.userId, req.user.role, key);
  }

  @Post(':id/advance-offsets')
  applyAdvance(@Param('id') id: string, @Body() dto: CreateAdvanceOffsetDto,
    @Req() req: any, @Headers('idempotency-key') key?: string) {
    return this.payables.applyAdvance(id, dto, req.user.userId, key);
  }

  @Post(':id/advance-offsets/:offsetId/reverse')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  reverseAdvance(@Param('id') id: string, @Param('offsetId') offsetId: string,
    @Body() dto: CancelPayableDto, @Req() req: any) {
    return this.payables.reverseAdvance(id, offsetId, dto.reason, req.user.userId);
  }

  @Post(':id/cancel')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  cancel(@Param('id') id: string, @Body() dto: CancelPayableDto, @Req() req: any) {
    return this.payables.cancel(id, dto, req.user.userId);
  }
}
