import { Body, Controller, Get, Headers, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { PayableStatus, RoleName, TransactionType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CreatePayablePaymentDto } from './dto/create-payable-payment.dto.js';
import { CreateAdvanceOffsetDto } from './dto/create-advance-offset.dto.js';
import { CancelPayableDto } from './dto/cancel-payable.dto.js';
import { PayablesService } from './payables.service.js';
import { makeClientPayableWorkbook } from './due-report-excel.js';

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
    const workbook = await makeClientPayableWorkbook(report);
    response.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition',
      'attachment; filename="CashLedger_NET_BALANCE_' + report.businessDate + '.xlsx"');
    response.setHeader('Cache-Control','no-store');
    const buffer = await workbook.xlsx.writeBuffer();
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

  @Get('reconciliation')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  reconciliation() {
    return this.payables.reconciliation();
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

  @Post(':id/existing-payout-matches')
  matchExistingPayOut(@Param('id') id: string, @Body() dto: CreateAdvanceOffsetDto, @Req() req: any) {
    return this.payables.matchExistingPayOut(id, dto, req.user.userId);
  }

  @Post(':id/existing-payout-matches/:allocationId/reverse')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  reverseExistingPayOutMatch(@Param('id') id: string,
    @Param('allocationId') allocationId: string, @Body() dto: { reason: string }, @Req() req: any) {
    return this.payables.reverseExistingPayOutMatch(id, allocationId, dto.reason, req.user.userId);
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
