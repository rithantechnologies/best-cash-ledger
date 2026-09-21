import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CashCounterService } from './cash-counter.service.js';
import { CloseCashSessionDto } from './dto/close-cash-session.dto.js';
import { OpenCashSessionDto } from './dto/open-cash-session.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('cash-counter')
export class CashCounterController {
  constructor(private readonly cashCounter: CashCounterService) {}

  @Get('today')
  today(@Query('cashAccountId') cashAccountId?: string) {
    return this.cashCounter.today(cashAccountId);
  }

  @Get('current')
  current(@Query('cashAccountId') cashAccountId?: string) {
    return this.cashCounter.current(cashAccountId);
  }

  @Get('history')
  history() {
    return this.cashCounter.history();
  }

  @Post('open')
  open(@Body() dto: OpenCashSessionDto, @Req() req: any) {
    return this.cashCounter.open(dto, req.user.userId);
  }

  @Post(':id/close')
  close(@Param('id') id: string, @Body() dto: CloseCashSessionDto, @Req() req: any) {
    return this.cashCounter.close(id, dto, req.user.userId);
  }
}
