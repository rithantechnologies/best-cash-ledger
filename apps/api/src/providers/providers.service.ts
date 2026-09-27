import { Injectable } from '@nestjs/common';
import { AccountNature, AccountType, LedgerType, UsageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateGatewayDto } from './dto/create-gateway.dto.js';
import { CreateProviderDto } from './dto/create-provider.dto.js';
import { UpdateGatewayDto } from './dto/update-gateway.dto.js';
import { UpdateProviderDto } from './dto/update-provider.dto.js';
import { SetAepsProviderCommissionRulesDto } from './dto/set-aeps-provider-commission-rules.dto.js';

@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  list(includeInactive = false) {
    return this.prisma.provider.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: {
        gateways: includeInactive ? true : { where: { isActive: true } },
        accounts: true,
        aepsProviderCommissionRules: {
          where: { effectiveTo: null },
          orderBy: { minAmount: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  create(dto: CreateProviderDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const provider = await tx.provider.create({ data: dto });
      const accountCode = 'WAL-' + provider.id.replaceAll('-', '').slice(0, 12).toUpperCase();
      const wallet = await tx.financialAccount.create({
        data: {
          accountCode,
          accountName: provider.name + ' Wallet',
          accountType: AccountType.PROVIDER_WALLET,
          accountNature: AccountNature.ASSET,
          providerId: provider.id,
          usageType: UsageType.BUSINESS,
          openingBalance: 0,
        },
      });
      await tx.ledgerAccount.create({
        data: {
          ledgerCode: 'LED-' + accountCode,
          ledgerName: wallet.accountName,
          ledgerType: LedgerType.ASSET,
          ledgerCategory: AccountType.PROVIDER_WALLET,
          financialAccountId: wallet.id,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'PROVIDER',
          entityId: provider.id,
          action: 'CREATE',
          newValues: {
            name: provider.name,
            providerType: provider.providerType,
            supportsAeps: provider.supportsAeps,
            aepsCommissionRate: provider.aepsCommissionRate.toString(),
            aepsProviderChargeRate: provider.aepsProviderChargeRate.toString(),
            isActive: provider.isActive,
          },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'FINANCIAL_ACCOUNT',
          entityId: wallet.id,
          action: 'CREATE',
          newValues: {
            accountName: wallet.accountName,
            accountCode: wallet.accountCode,
            accountType: wallet.accountType,
            providerId: provider.id,
            openingBalance: '0',
          },
        },
      });
      return provider;
    });
  }

  addGateway(providerId: string, dto: CreateGatewayDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const gateway = await tx.providerGateway.create({
        data: { providerId, ...dto },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'PROVIDER_GATEWAY',
          entityId: gateway.id,
          action: 'CREATE',
          newValues: {
            providerId,
            gatewayName: gateway.gatewayName,
            defaultChargeType: gateway.defaultChargeType,
            defaultChargeRate: gateway.defaultChargeRate.toString(),
          },
        },
      });
      return gateway;
    });
  }

  async updateProvider(id: string, dto: UpdateProviderDto, actorId: string) {
    const existing = await this.prisma.provider.findUnique({ where: { id } });
    if (!existing) throw new Error('Provider not found');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.provider.update({ where: { id }, data: dto });
      if (dto.name && dto.name !== existing.name) {
        const wallet = await tx.financialAccount.findFirst({
          where: { providerId: id, accountType: AccountType.PROVIDER_WALLET },
          include: { ledgerAccount: true },
        });
        if (wallet) {
          const walletName = updated.name + ' Wallet';
          await tx.financialAccount.update({
            where: { id: wallet.id },
            data: { accountName: walletName },
          });
          if (wallet.ledgerAccount) {
            await tx.ledgerAccount.update({
              where: { id: wallet.ledgerAccount.id },
              data: { ledgerName: walletName },
            });
          }
        }
      }
      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'PROVIDER',
          entityId: id,
          action: 'UPDATE',
          oldValues: {
            name: existing.name,
            providerType: existing.providerType,
            notes: existing.notes,
            supportsAeps: existing.supportsAeps,
            aepsCommissionRate: existing.aepsCommissionRate.toString(),
            aepsProviderChargeRate: existing.aepsProviderChargeRate.toString(),
          },
          newValues: {
            name: updated.name,
            providerType: updated.providerType,
            notes: updated.notes,
            supportsAeps: updated.supportsAeps,
            aepsCommissionRate: updated.aepsCommissionRate.toString(),
            aepsProviderChargeRate: updated.aepsProviderChargeRate.toString(),
          },
        },
      });
      return updated;
    });
  }



  async setAepsProviderCommissionRules(
    providerId: string,
    dto: SetAepsProviderCommissionRulesDto,
    actorId: string,
  ) {
    const normalized = [...dto.rules]
      .map((rule) => ({
        minAmount: Number(rule.minAmount),
        maxAmount: rule.maxAmount === undefined ? null : Number(rule.maxAmount),
        calculationType: rule.calculationType,
        value: Number(rule.value),
      }))
      .sort((a, b) => a.minAmount - b.minAmount);

    for (let index = 0; index < normalized.length; index += 1) {
      const rule = normalized[index];
      if (rule.maxAmount !== null && rule.maxAmount < rule.minAmount) {
        throw new Error('AEPS provider commission slab maximum must be at least the minimum');
      }
      const previous = normalized[index - 1];
      if (
        previous &&
        (previous.maxAmount === null || previous.maxAmount >= rule.minAmount)
      ) {
        throw new Error('AEPS provider commission slabs cannot overlap');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const provider = await tx.provider.findUnique({ where: { id: providerId } });
      if (!provider) throw new Error('Provider not found');

      const current = await tx.aepsProviderCommissionRule.findMany({
        where: { providerId, effectiveTo: null },
        orderBy: { minAmount: 'asc' },
      });
      const effectiveAt = new Date();
      if (current.length) {
        await tx.aepsProviderCommissionRule.updateMany({
          where: { providerId, effectiveTo: null },
          data: { effectiveTo: effectiveAt },
        });
      }
      if (normalized.length) {
        await tx.aepsProviderCommissionRule.createMany({
          data: normalized.map((rule) => ({
            providerId,
            minAmount: rule.minAmount,
            maxAmount: rule.maxAmount,
            calculationType: rule.calculationType,
            value: rule.value,
            effectiveFrom: effectiveAt,
            createdById: actorId,
          })),
        });
      }
      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'AEPS_PROVIDER_COMMISSION_RULES',
          entityId: providerId,
          action: 'UPDATE',
          oldValues: current.map((rule) => ({
            minAmount: rule.minAmount.toString(),
            maxAmount: rule.maxAmount?.toString() ?? null,
            calculationType: rule.calculationType,
            value: rule.value.toString(),
          })),
          newValues: normalized,
        },
      });
      return tx.aepsProviderCommissionRule.findMany({
        where: { providerId, effectiveTo: null },
        orderBy: { minAmount: 'asc' },
      });
    });
  }

  async setProviderActive(id: string, isActive: boolean, actorId: string) {
    const existing = await this.prisma.provider.findUnique({ where: { id } });
    if (!existing) throw new Error('Provider not found');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.provider.update({ where: { id }, data: { isActive } });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'PROVIDER',
          entityId: id,
          action: isActive ? 'REACTIVATE' : 'DEACTIVATE',
          oldValues: { isActive: existing.isActive },
          newValues: { isActive },
        },
      });
      return updated;
    });
  }

  async updateGateway(id: string, dto: UpdateGatewayDto, actorId: string) {
    const existing = await this.prisma.providerGateway.findUnique({ where: { id } });
    if (!existing) throw new Error('Gateway not found');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.providerGateway.update({ where: { id }, data: dto });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'PROVIDER_GATEWAY',
          entityId: id,
          action: 'UPDATE',
          oldValues: {
            gatewayName: existing.gatewayName,
            defaultChargeType: existing.defaultChargeType,
            defaultChargeRate: existing.defaultChargeRate.toString(),
          },
          newValues: {
            gatewayName: updated.gatewayName,
            defaultChargeType: updated.defaultChargeType,
            defaultChargeRate: updated.defaultChargeRate.toString(),
          },
        },
      });
      return updated;
    });
  }

  async setGatewayActive(id: string, isActive: boolean, actorId: string) {
    const existing = await this.prisma.providerGateway.findUnique({ where: { id } });
    if (!existing) throw new Error('Gateway not found');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.providerGateway.update({ where: { id }, data: { isActive } });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'PROVIDER_GATEWAY',
          entityId: id,
          action: isActive ? 'REACTIVATE' : 'DEACTIVATE',
          oldValues: { isActive: existing.isActive },
          newValues: { isActive },
        },
      });
      return updated;
    });
  }
}
