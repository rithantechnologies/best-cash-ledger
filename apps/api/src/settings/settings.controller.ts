import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RoleName, TransactionType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto.js';
import { CreateCashInTransferTypeDto } from './dto/create-cash-in-transfer-type.dto.js';
import { CreateServiceCatalogDto } from './dto/create-service-catalog.dto.js';
import { CreatePaymentTermDto } from './dto/create-payment-term.dto.js';
import { CreateCommissionRuleDto } from './dto/create-commission-rule.dto.js';
import { SetActiveDto } from './dto/set-active.dto.js';
import { UpdateCommissionRuleDto } from './dto/update-commission-rule.dto.js';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto.js';
import { UpdateCashInTransferTypeDto } from './dto/update-cash-in-transfer-type.dto.js';
import { UpdateServiceCatalogDto } from './dto/update-service-catalog.dto.js';
import { UpdatePaymentTermDto } from './dto/update-payment-term.dto.js';
import { SettingsService } from './settings.service.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('payment-terms')
  paymentTerms(@Query('includeInactive') includeInactive?: string) {
    return this.settings.paymentTerms(includeInactive === 'true');
  }

  @Post('payment-terms')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  createPaymentTerm(@Body() dto: CreatePaymentTermDto, @Req() req: any) {
    return this.settings.createPaymentTerm(dto, req.user.userId);
  }

  @Patch('payment-terms/:id')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  updatePaymentTerm(@Param('id') id: string, @Body() dto: UpdatePaymentTermDto, @Req() req: any) {
    return this.settings.updatePaymentTerm(id, dto, req.user.userId);
  }

  @Patch('payment-terms/:id/active')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  setPaymentTermActive(@Param('id') id: string, @Body() dto: SetActiveDto, @Req() req: any) {
    return this.settings.setPaymentTermActive(id, dto.isActive, req.user.userId);
  }

  @Get('services')
  services(@Query('includeInactive') includeInactive?: string) {
    return this.settings.services(includeInactive === 'true');
  }

  @Post('services')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  createService(@Body() dto: CreateServiceCatalogDto, @Req() req: any) {
    return this.settings.createService(dto, req.user.userId);
  }

  @Patch('services/:id')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  updateService(@Param('id') id: string, @Body() dto: UpdateServiceCatalogDto, @Req() req: any) {
    return this.settings.updateService(id, dto, req.user.userId);
  }

  @Patch('services/:id/active')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  setServiceActive(@Param('id') id: string, @Body() dto: SetActiveDto, @Req() req: any) {
    return this.settings.setServiceActive(id, dto.isActive, req.user.userId);
  }

  @Get('cash-in-transfer-types')
  cashInTransferTypes(@Query('includeInactive') includeInactive?: string) {
    return this.settings.cashInTransferTypes(includeInactive === 'true');
  }

  @Post('cash-in-transfer-types')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  createCashInTransferType(@Body() dto: CreateCashInTransferTypeDto, @Req() req: any) {
    return this.settings.createCashInTransferType(dto, req.user.userId);
  }

  @Patch('cash-in-transfer-types/:id')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  updateCashInTransferType(
    @Param('id') id: string,
    @Body() dto: UpdateCashInTransferTypeDto,
    @Req() req: any,
  ) {
    return this.settings.updateCashInTransferType(id, dto, req.user.userId);
  }

  @Patch('cash-in-transfer-types/:id/active')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  setCashInTransferTypeActive(
    @Param('id') id: string,
    @Body() dto: SetActiveDto,
    @Req() req: any,
  ) {
    return this.settings.setCashInTransferTypeActive(
      id,
      dto.isActive,
      req.user.userId,
    );
  }

  @Get('expense-categories')
  expenseCategories(@Query('includeInactive') includeInactive?: string) {
    return this.settings.expenseCategories(includeInactive === 'true');
  }

  @Post('expense-categories')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  createExpenseCategory(@Body() dto: CreateExpenseCategoryDto, @Req() req: any) {
    return this.settings.createExpenseCategory(dto, req.user.userId);
  }

  @Patch('expense-categories/:id')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  updateExpenseCategory(@Param('id') id: string, @Body() dto: UpdateExpenseCategoryDto, @Req() req: any) {
    return this.settings.updateExpenseCategory(id, dto, req.user.userId);
  }

  @Patch('expense-categories/:id/active')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  setExpenseCategoryActive(@Param('id') id: string, @Body() dto: SetActiveDto, @Req() req: any) {
    return this.settings.setExpenseCategoryActive(id, dto.isActive, req.user.userId);
  }

  @Get('commission-rules')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  commissionRules(@Query('includeInactive') includeInactive?: string) {
    return this.settings.commissionRules(includeInactive === 'true');
  }

  @Post('commission-rules')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  createCommissionRule(@Body() dto: CreateCommissionRuleDto, @Req() req: any) {
    return this.settings.createCommissionRule(dto, req.user.userId);
  }

  @Get('commission-rules/resolve')
  resolveCommission(
    @Query('transactionType') transactionType: TransactionType,
    @Query('customerId') customerId?: string,
    @Query('providerId') providerId?: string,
    @Query('gatewayId') gatewayId?: string,
    @Query('paymentTermId') paymentTermId?: string,
  ) {
    return this.settings.resolveCommission({
      transactionType,
      customerId,
      providerId,
      gatewayId,
      paymentTermId,
    });
  }

  @Patch('commission-rules/:id')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  updateCommissionRule(@Param('id') id: string, @Body() dto: UpdateCommissionRuleDto, @Req() req: any) {
    return this.settings.updateCommissionRule(id, dto, req.user.userId);
  }

  @Patch('commission-rules/:id/active')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  setCommissionRuleActive(@Param('id') id: string, @Body() dto: SetActiveDto, @Req() req: any) {
    return this.settings.setCommissionRuleActive(id, dto.isActive, req.user.userId);
  }
}
