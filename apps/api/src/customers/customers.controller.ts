import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateCardDto } from './dto/create-card.dto.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { CreateBankAccountDto } from './dto/create-bank-account.dto.js';
import { CreateUpiAccountDto } from './dto/create-upi-account.dto.js';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto.js';
import { CreateBeneficiaryAccountDto } from './dto/create-beneficiary-account.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { UpdateCardDto } from './dto/update-card.dto.js';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto.js';
import { UpdateUpiAccountDto } from './dto/update-upi-account.dto.js';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto.js';
import { UpdateBeneficiaryAccountDto } from './dto/update-beneficiary-account.dto.js';
import { SetCustomerItemActiveDto } from './dto/set-customer-item-active.dto.js';
import { CustomersService } from './customers.service.js';

@UseGuards(JwtAuthGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.customers.list({
      search: q,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      sortBy,
      sortDir,
      includeInactive: includeInactive === 'true',
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.customers.get(id);
  }

  @Post()
  create(@Body() dto: CreateCustomerDto, @Req() req: any) {
    return this.customers.create(dto, req.user.userId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto, @Req() req: any) {
    return this.customers.update(id, dto, req.user.userId);
  }

  @Patch(':id/active')
  setCustomerActive(@Param('id') id: string, @Body() dto: SetCustomerItemActiveDto, @Req() req: any) {
    return this.customers.setCustomerActive(id, dto.isActive, req.user.userId);
  }

  @Post(':id/cards')
  addCard(@Param('id') id: string, @Body() dto: CreateCardDto, @Req() req: any) {
    return this.customers.addCard(id, dto, req.user.userId);
  }

  @Patch('cards/:id')
  updateCard(@Param('id') id: string, @Body() dto: UpdateCardDto, @Req() req: any) {
    return this.customers.updateCard(id, dto, req.user.userId);
  }

  @Patch('cards/:id/active')
  setCardActive(@Param('id') id: string, @Body() dto: SetCustomerItemActiveDto, @Req() req: any) {
    return this.customers.setCardActive(id, dto.isActive, req.user.userId);
  }

  @Post(':id/banks')
  addBank(@Param('id') id: string, @Body() dto: CreateBankAccountDto, @Req() req: any) {
    return this.customers.addBankAccount(id, dto, req.user.userId);
  }

  @Patch('banks/:id')
  updateBank(@Param('id') id: string, @Body() dto: UpdateBankAccountDto, @Req() req: any) {
    return this.customers.updateBankAccount(id, dto, req.user.userId);
  }

  @Patch('banks/:id/active')
  setBankActive(@Param('id') id: string, @Body() dto: SetCustomerItemActiveDto, @Req() req: any) {
    return this.customers.setBankActive(id, dto.isActive, req.user.userId);
  }

  @Post(':id/upi')
  addUpi(@Param('id') id: string, @Body() dto: CreateUpiAccountDto, @Req() req: any) {
    return this.customers.addUpiAccount(id, dto, req.user.userId);
  }

  @Patch('upi/:id')
  updateUpi(@Param('id') id: string, @Body() dto: UpdateUpiAccountDto, @Req() req: any) {
    return this.customers.updateUpiAccount(id, dto, req.user.userId);
  }

  @Patch('upi/:id/active')
  setUpiActive(@Param('id') id: string, @Body() dto: SetCustomerItemActiveDto, @Req() req: any) {
    return this.customers.setUpiActive(id, dto.isActive, req.user.userId);
  }

  @Post(':id/beneficiaries')
  addBeneficiary(@Param('id') id: string, @Body() dto: CreateBeneficiaryDto, @Req() req: any) {
    return this.customers.addBeneficiary(id, dto, req.user.userId);
  }

  @Patch('beneficiaries/:id')
  updateBeneficiary(@Param('id') id: string, @Body() dto: UpdateBeneficiaryDto, @Req() req: any) {
    return this.customers.updateBeneficiary(id, dto, req.user.userId);
  }

  @Patch('beneficiaries/:id/active')
  setBeneficiaryActive(@Param('id') id: string, @Body() dto: SetCustomerItemActiveDto, @Req() req: any) {
    return this.customers.setBeneficiaryActive(id, dto.isActive, req.user.userId);
  }

  @Post('beneficiaries/:id/accounts')
  addBeneficiaryAccount(@Param('id') id: string, @Body() dto: CreateBeneficiaryAccountDto, @Req() req: any) {
    return this.customers.addBeneficiaryAccount(id, dto, req.user.userId);
  }

  @Patch('beneficiary-accounts/:id')
  updateBeneficiaryAccount(@Param('id') id: string, @Body() dto: UpdateBeneficiaryAccountDto, @Req() req: any) {
    return this.customers.updateBeneficiaryAccount(id, dto, req.user.userId);
  }

  @Patch('beneficiary-accounts/:id/active')
  setBeneficiaryAccountActive(@Param('id') id: string, @Body() dto: SetCustomerItemActiveDto, @Req() req: any) {
    return this.customers.setBeneficiaryAccountActive(id, dto.isActive, req.user.userId);
  }
}
