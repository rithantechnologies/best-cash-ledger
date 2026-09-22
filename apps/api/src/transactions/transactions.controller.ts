import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RoleName, TransactionStatus, TransactionType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CreateAepsDto } from './dto/create-aeps.dto.js';
import { CreateAtmWithdrawalDto } from './dto/create-atm-withdrawal.dto.js';
import { CreateCardSwipeDto } from './dto/create-card-swipe.dto.js';
import {
  CardDueCommissionCollectionDto,
  CardDueRecoveryDto,
  CreateCardDueClearingDto,
  SetCardDueFollowUpDto,
} from './dto/create-card-due-clearing.dto.js';
import { CreateCashTransferDto } from './dto/create-cash-transfer.dto.js';
import { CreateCreditCardPaymentDto } from './dto/create-credit-card-payment.dto.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { CreateInternalTransferDto } from './dto/create-internal-transfer.dto.js';
import { CreateMicroAtmDto } from './dto/create-micro-atm.dto.js';
import { ReverseTransactionDto } from './dto/reverse-transaction.dto.js';
import { CardDueClearingService } from './card-due-clearing.service.js';
import { TransactionsService } from './transactions.service.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly cardDueClearings: CardDueClearingService,
  ) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('q') q?: string,
    @Query('type') type?: TransactionType,
    @Query('status') status?: TransactionStatus,
    @Query('moneyStatus') moneyStatus?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.transactions.list({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      sortBy,
      sortDir,
      q,
      type,
      status,
      moneyStatus,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Get('customer/:customerId/card-swipes')
  customerCardSwipes(@Param('customerId') customerId: string) {
    return this.transactions.listCustomerCardSwipes(customerId);
  }

  @Get('card-due-clearings')
  listCardDueClearings(
    @Query('customerId') customerId?: string,
    @Query('openOnly') openOnly?: string,
  ) {
    return this.cardDueClearings.list({
      customerId,
      openOnly: openOnly === 'true',
    });
  }

  @Get('card-due-clearings/:id')
  getCardDueClearing(@Param('id') id: string) {
    return this.cardDueClearings.get(id);
  }

  @Post('card-due-clearing')
  createCardDueClearing(
    @Body() dto: CreateCardDueClearingDto,
    @Req() req: any,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.cardDueClearings.create(dto, req.user.userId, key);
  }

  @Post('card-due-clearings/:id/recoveries')
  addCardDueRecovery(
    @Param('id') id: string,
    @Body() dto: CardDueRecoveryDto,
    @Req() req: any,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.cardDueClearings.addRecovery(id, dto, req.user.userId, key);
  }

  @Post('card-due-clearings/:id/commission-collections')
  addCardDueCommissionCollection(
    @Param('id') id: string,
    @Body() dto: CardDueCommissionCollectionDto,
    @Req() req: any,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.cardDueClearings.addCommissionCollection(id, dto, req.user.userId, key);
  }

  @Post('card-due-clearings/:id/follow-up')
  setCardDueFollowUp(
    @Param('id') id: string,
    @Body() dto: SetCardDueFollowUpDto,
    @Req() req: any,
  ) {
    return this.cardDueClearings.setFollowUp(id, dto, req.user.userId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.transactions.get(id);
  }

  @Post('card-swipe')
  createCardSwipe(@Body() dto: CreateCardSwipeDto, @Req() req: any, @Headers('idempotency-key') key?: string) {
    return this.transactions.createCardSwipe(dto, req.user.userId, req.user.role, key);
  }

  @Post('cash-transfer')
  createCashTransfer(@Body() dto: CreateCashTransferDto, @Req() req: any, @Headers('idempotency-key') key?: string) {
    return this.transactions.createCashTransfer(dto, req.user.userId, key);
  }

  @Post('aeps')
  createAeps(@Body() dto: CreateAepsDto, @Req() req: any, @Headers('idempotency-key') key?: string) {
    return this.transactions.createAeps(dto, req.user.userId, key);
  }

  @Post('micro-atm')
  createMicroAtm(@Body() dto: CreateMicroAtmDto, @Req() req: any, @Headers('idempotency-key') key?: string) {
    return this.transactions.createMicroAtm(dto, req.user.userId, key);
  }

  @Post('internal-transfer')
  createInternalTransfer(@Body() dto: CreateInternalTransferDto, @Req() req: any, @Headers('idempotency-key') key?: string) {
    return this.transactions.createInternalTransfer(dto, req.user.userId, key);
  }

  @Post('expense')
  createExpense(@Body() dto: CreateExpenseDto, @Req() req: any, @Headers('idempotency-key') key?: string) {
    return this.transactions.createExpense(dto, req.user.userId, key);
  }

  @Post('atm-withdrawal')
  createAtmWithdrawal(@Body() dto: CreateAtmWithdrawalDto, @Req() req: any, @Headers('idempotency-key') key?: string) {
    return this.transactions.createAtmWithdrawal(dto, req.user.userId, key);
  }

  @Post('owner-credit-card-payment')
  createCreditCardPayment(@Body() dto: CreateCreditCardPaymentDto, @Req() req: any, @Headers('idempotency-key') key?: string) {
    return this.transactions.createCreditCardPayment(dto, req.user.userId, key);
  }

  @Post(':id/reverse')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  reverse(@Param('id') id: string, @Body() dto: ReverseTransactionDto, @Req() req: any) {
    return this.transactions.reverse(id, dto, req.user.userId);
  }
}
