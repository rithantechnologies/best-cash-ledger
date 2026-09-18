import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ProviderSettlementStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateProviderSettlementReceiptDto } from './dto/create-provider-settlement-receipt.dto.js';
import { ProviderSettlementsService } from './provider-settlements.service.js';

@UseGuards(JwtAuthGuard)
@Controller('provider-settlements')
export class ProviderSettlementsController {
  constructor(private readonly settlements: ProviderSettlementsService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
    @Query('status') status?: ProviderSettlementStatus,
    @Query('providerId') providerId?: string,
  ) {
    return this.settlements.list({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      q,
      status,
      providerId,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.settlements.get(id);
  }

  @Post(':id/receipts')
  receive(
    @Param('id') id: string,
    @Body() dto: CreateProviderSettlementReceiptDto,
    @Req() req: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.settlements.receive(
      id,
      dto,
      req.user.userId,
      idempotencyKey,
    );
  }
}
