import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PayableStatus, RoleName } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CreatePayablePaymentDto } from './dto/create-payable-payment.dto.js';
import { CancelPayableDto } from './dto/cancel-payable.dto.js';
import { PayablesService } from './payables.service.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payables')
export class PayablesController {
  constructor(private readonly payables: PayablesService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
    @Query('status') status?: PayableStatus,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
  ) {
    return this.payables.list({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      q,
      status,
      sortBy,
      sortDir,
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
    return this.payables.pay(id, dto, req.user.userId, key);
  }

  @Post(':id/cancel')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  cancel(@Param('id') id: string, @Body() dto: CancelPayableDto, @Req() req: any) {
    return this.payables.cancel(id, dto, req.user.userId);
  }
}
