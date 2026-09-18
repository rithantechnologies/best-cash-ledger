import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ReportsService } from './reports.service.js';

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('transactions')
  transactions(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('customerId') customerId?: string,
    @Query('type') type?: TransactionType,
    @Query('status') status?: string,
    @Query('reference') reference?: string,
    @Query('providerId') providerId?: string,
    @Query('gatewayId') gatewayId?: string,
    @Query('accountId') accountId?: string,
    @Query('staffId') staffId?: string,
  ) {
    return this.reports.transactions({
      from, to, customerId, type, status, reference, providerId, gatewayId, accountId, staffId,
    });
  }

  @Get('accounts/:id')
  account(@Param('id') id: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.accountLedger(id, from, to);
  }

  @Get('customers/:id')
  customer(@Param('id') id: string) {
    return this.reports.customerLedger(id);
  }

  @Get('commissions')
  commissions(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.commission(from, to);
  }

  @Get('provider-charges')
  charges(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.providerCharges(from, to);
  }

  @Get('payables')
  payables() {
    return this.reports.payables();
  }

  @Get('operators')
  operators() {
    return this.reports.operators();
  }

  @Get('daily-summary')
  daily(@Query('date') date?: string) {
    return this.reports.dailySummary(date);
  }
}
