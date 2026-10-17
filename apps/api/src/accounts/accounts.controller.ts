import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { RoleName } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { AccountsService } from './accounts.service.js';
import { AccountImagesService } from './account-images.service.js';
import { WalletReconciliationService } from './wallet-reconciliation.service.js';
import { ReconcileWalletDto } from './dto/reconcile-wallet.dto.js';
import { CreateAccountDto } from './dto/create-account.dto.js';
import { SetAccountActiveDto } from './dto/set-account-active.dto.js';
import { SetOpeningBalanceDto } from './dto/set-opening-balance.dto.js';
import { UpdateAccountDto } from './dto/update-account.dto.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService, private readonly images: AccountImagesService, private readonly walletReconciliation: WalletReconciliationService) {}

  @Get(':id/image')
  async image(@Param('id') id: string, @Res() response: Response) {
    const image = await this.images.get(id);
    response.setHeader('Content-Type', image.contentType);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return response.send(image.contents);
  }

  @Post(':id/image')
  @Roles(RoleName.OWNER)
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
  uploadImage(@Param('id') id: string, @UploadedFile() file: { buffer: Buffer } | undefined, @Req() req: any) {
    return this.images.upload(id, file?.buffer, req.user.userId);
  }

  @Delete(':id/image')
  @Roles(RoleName.OWNER)
  removeImage(@Param('id') id: string, @Req() req: any) {
    return this.images.remove(id, req.user.userId);
  }

  @Get()
  list(@Req() req: any) {
    return this.accounts.list(req.user.role);
  }

  @Post()
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  create(@Body() dto: CreateAccountDto, @Req() req: any) {
    return this.accounts.create(dto, req.user.userId, req.user.role);
  }

  @Get(':id/reconciliation')
  @Roles(RoleName.OWNER)
  previewAccountReconciliation(@Param('id') id: string) {
    return this.walletReconciliation.preview(id);
  }

  @Post(':id/reconciliation')
  @Roles(RoleName.OWNER)
  reconcileAccount(@Param('id') id: string, @Body() dto: ReconcileWalletDto, @Req() req: any, @Headers('idempotency-key') key?: string) {
    return this.walletReconciliation.reconcile(id, dto, req.user.userId, key);
  }

  @Get(':id/wallet-reconciliation')
  @Roles(RoleName.OWNER)
  previewWalletReconciliation(@Param('id') id: string) {
    return this.walletReconciliation.preview(id);
  }

  @Post(':id/wallet-reconciliation')
  @Roles(RoleName.OWNER)
  reconcileWallet(@Param('id') id: string, @Body() dto: ReconcileWalletDto, @Req() req: any, @Headers('idempotency-key') key?: string) {
    return this.walletReconciliation.reconcile(id, dto, req.user.userId, key);
  }

  @Patch(':id/opening-balance')
  @Roles(RoleName.OWNER)
  setOpeningBalance(@Param('id') id: string, @Body() dto: SetOpeningBalanceDto, @Req() req: any) {
    return this.accounts.setOpeningBalance(id, dto, req.user.userId);
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
