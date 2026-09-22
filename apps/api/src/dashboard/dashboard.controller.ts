import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { DashboardService } from './dashboard.service.js';

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary(@Req() req: any) {
    return this.dashboard.summary(req.user.role, req.user.userId);
  }

  @Get('accounts')
  accounts(@Req() req: any) {
    return this.dashboard.accounts(req.user.role, req.user.userId);
  }

  @Get('today')
  today() {
    return this.dashboard.today();
  }

  @Get('payables')
  payables() {
    return this.dashboard.payables();
  }

  @Get('receivables')
  receivables() {
    return this.dashboard.receivables();
  }

  @Get('obligation-insights')
  obligationInsights() {
    return this.dashboard.obligationInsights();
  }

  @Get('position-trend')
  positionTrend() {
    return this.dashboard.positionTrend();
  }

  @Get('analytics')
  analytics(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('scope') scope?: string,
  ) {
    return this.dashboard.analytics({ from, to, scope });
  }

  @Get('last-10-days')
  lastTenDays(@Query('type') type?: string) {
    return this.dashboard.lastTenDays(type);
  }

  @Get('recent-transactions')
  recent(@Query('limit') limit?: string) {
    return this.dashboard.recentTransactions(Number(limit ?? 10));
  }
}
