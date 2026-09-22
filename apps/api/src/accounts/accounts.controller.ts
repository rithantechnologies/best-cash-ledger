import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { AccountsService } from './accounts.service.js';
import { CreateAccountDto } from './dto/create-account.dto.js';
import { SetAccountActiveDto } from './dto/set-account-active.dto.js';
import { UpdateAccountDto } from './dto/update-account.dto.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list(@Req() req: any) {
    return this.accounts.list(req.user.role);
  }

  @Post()
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  create(@Body() dto: CreateAccountDto, @Req() req: any) {
    return this.accounts.create(dto, req.user.userId);
  }

  @Patch(':id')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateAccountDto, @Req() req: any) {
    return this.accounts.update(id, dto, req.user.userId);
  }

  @Patch(':id/active')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  setActive(@Param('id') id: string, @Body() dto: SetAccountActiveDto, @Req() req: any) {
    return this.accounts.setActive(id, dto.isActive, req.user.userId);
  }
}
