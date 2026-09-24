import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto.js';
import { CreateServiceCatalogDto } from './dto/create-service-catalog.dto.js';
import { CreatePaymentTermDto } from './dto/create-payment-term.dto.js';
import { CreateCommissionRuleDto } from './dto/create-commission-rule.dto.js';
import { UpdatePaymentTermDto } from './dto/update-payment-term.dto.js';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto.js';
import { UpdateServiceCatalogDto } from './dto/update-service-catalog.dto.js';
import { UpdateCommissionRuleDto } from './dto/update-commission-rule.dto.js';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  paymentTerms(includeInactive = false) {
    return this.prisma.paymentTerm.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ durationValue: 'asc' }, { name: 'asc' }],
    });
  }

  createPaymentTerm(dto: CreatePaymentTermDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const term = await tx.paymentTerm.create({
        data: { ...dto, defaultCommissionRate: dto.defaultCommissionRate },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'PAYMENT_TERM',
          entityId: term.id,
          action: 'CREATE',
          newValues: {
            name: term.name,
            durationValue: term.durationValue,
            durationUnit: term.durationUnit,
            defaultCommissionType: term.defaultCommissionType,
            defaultCommissionRate: term.defaultCommissionRate.toString(),
            isActive: term.isActive,
          },
        },
      });
      return term;
    });
  }

  async updatePaymentTerm(id: string, dto: UpdatePaymentTermDto, actorId: string) {
    const existing = await this.prisma.paymentTerm.findUnique({ where: { id } });
    if (!existing) throw new Error('Payment term not found');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.paymentTerm.update({ where: { id }, data: dto });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'PAYMENT_TERM',
          entityId: id,
          action: 'UPDATE',
          oldValues: {
            name: existing.name,
            durationValue: existing.durationValue,
            durationUnit: existing.durationUnit,
            defaultCommissionType: existing.defaultCommissionType,
            defaultCommissionRate: existing.defaultCommissionRate.toString(),
          },
          newValues: {
            name: updated.name,
            durationValue: updated.durationValue,
            durationUnit: updated.durationUnit,
            defaultCommissionType: updated.defaultCommissionType,
            defaultCommissionRate: updated.defaultCommissionRate.toString(),
          },
        },
      });
      return updated;
    });
  }

  async setPaymentTermActive(id: string, isActive: boolean, actorId: string) {
    const existing = await this.prisma.paymentTerm.findUnique({ where: { id } });
    if (!existing) throw new Error('Payment term not found');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.paymentTerm.update({ where: { id }, data: { isActive } });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'PAYMENT_TERM',
          entityId: id,
          action: isActive ? 'REACTIVATE' : 'DEACTIVATE',
          oldValues: { isActive: existing.isActive },
          newValues: { isActive },
        },
      });
      return updated;
    });
  }

  services(includeInactive = false) {
    return this.prisma.serviceCatalog.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  createService(dto: CreateServiceCatalogDto, actorId: string) {
    const name = dto.name.trim();
    return this.prisma.$transaction(async (tx) => {
      const service = await tx.serviceCatalog.create({
        data: {
          name,
          defaultAmount: dto.defaultAmount === undefined ? null : dto.defaultAmount,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'SERVICE_CATALOG',
          entityId: service.id,
          action: 'CREATE',
          newValues: {
            name: service.name,
            defaultAmount: service.defaultAmount?.toString() ?? null,
            isActive: service.isActive,
          },
        },
      });
      return service;
    });
  }

  async updateService(id: string, dto: UpdateServiceCatalogDto, actorId: string) {
    const existing = await this.prisma.serviceCatalog.findUnique({ where: { id } });
    if (!existing) throw new Error('Service not found');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.serviceCatalog.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.defaultAmount !== undefined ? { defaultAmount: dto.defaultAmount } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'SERVICE_CATALOG',
          entityId: id,
          action: 'UPDATE',
          oldValues: {
            name: existing.name,
            defaultAmount: existing.defaultAmount?.toString() ?? null,
          },
          newValues: {
            name: updated.name,
            defaultAmount: updated.defaultAmount?.toString() ?? null,
          },
        },
      });
      return updated;
    });
  }

  async setServiceActive(id: string, isActive: boolean, actorId: string) {
    const existing = await this.prisma.serviceCatalog.findUnique({ where: { id } });
    if (!existing) throw new Error('Service not found');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.serviceCatalog.update({ where: { id }, data: { isActive } });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'SERVICE_CATALOG',
          entityId: id,
          action: isActive ? 'REACTIVATE' : 'DEACTIVATE',
          oldValues: { isActive: existing.isActive },
          newValues: { isActive },
        },
      });
      return updated;
    });
  }

  expenseCategories(includeInactive = false) {
    return this.prisma.expenseCategory.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: { _count: { select: { expenses: true } } },
      orderBy: { name: 'asc' },
    });
  }

  createExpenseCategory(dto: CreateExpenseCategoryDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.expenseCategory.create({ data: dto });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'EXPENSE_CATEGORY',
          entityId: category.id,
          action: 'CREATE',
          newValues: {
            name: category.name,
            expenseUsage: category.expenseUsage,
            isActive: category.isActive,
          },
        },
      });
      return category;
    });
  }

  async updateExpenseCategory(id: string, dto: UpdateExpenseCategoryDto, actorId: string) {
    const existing = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!existing) throw new Error('Expense category not found');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.expenseCategory.update({ where: { id }, data: dto });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'EXPENSE_CATEGORY',
          entityId: id,
          action: 'UPDATE',
          oldValues: { name: existing.name, expenseUsage: existing.expenseUsage },
          newValues: { name: updated.name, expenseUsage: updated.expenseUsage },
        },
      });
      return updated;
    });
  }

  async setExpenseCategoryActive(id: string, isActive: boolean, actorId: string) {
    const existing = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!existing) throw new Error('Expense category not found');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.expenseCategory.update({ where: { id }, data: { isActive } });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'EXPENSE_CATEGORY',
          entityId: id,
          action: isActive ? 'REACTIVATE' : 'DEACTIVATE',
          oldValues: { isActive: existing.isActive },
          newValues: { isActive },
        },
      });
      return updated;
    });
  }

  commissionRules(includeInactive = false) {
    return this.prisma.commissionRule.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: { paymentTerm: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  createCommissionRule(dto: CreateCommissionRuleDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.commissionRule.create({
        data: { ...dto, commissionRate: dto.commissionRate },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'COMMISSION_RULE',
          entityId: rule.id,
          action: 'CREATE',
          newValues: {
            customerId: rule.customerId,
            providerId: rule.providerId,
            gatewayId: rule.gatewayId,
            paymentTermId: rule.paymentTermId,
            transactionType: rule.transactionType,
            commissionType: rule.commissionType,
            commissionRate: rule.commissionRate.toString(),
            isActive: rule.isActive,
          },
        },
      });
      return rule;
    });
  }

  async updateCommissionRule(id: string, dto: UpdateCommissionRuleDto, actorId: string) {
    const existing = await this.prisma.commissionRule.findUnique({ where: { id } });
    if (!existing) throw new Error('Commission rule not found');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.commissionRule.update({ where: { id }, data: dto });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'COMMISSION_RULE',
          entityId: id,
          action: 'UPDATE',
          oldValues: {
            customerId: existing.customerId,
            providerId: existing.providerId,
            gatewayId: existing.gatewayId,
            paymentTermId: existing.paymentTermId,
            transactionType: existing.transactionType,
            commissionType: existing.commissionType,
            commissionRate: existing.commissionRate.toString(),
          },
          newValues: {
            customerId: updated.customerId,
            providerId: updated.providerId,
            gatewayId: updated.gatewayId,
            paymentTermId: updated.paymentTermId,
            transactionType: updated.transactionType,
            commissionType: updated.commissionType,
            commissionRate: updated.commissionRate.toString(),
          },
        },
      });
      return updated;
    });
  }

  async setCommissionRuleActive(id: string, isActive: boolean, actorId: string) {
    const existing = await this.prisma.commissionRule.findUnique({ where: { id } });
    if (!existing) throw new Error('Commission rule not found');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.commissionRule.update({ where: { id }, data: { isActive } });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'COMMISSION_RULE',
          entityId: id,
          action: isActive ? 'REACTIVATE' : 'DEACTIVATE',
          oldValues: { isActive: existing.isActive },
          newValues: { isActive },
        },
      });
      return updated;
    });
  }

  async resolveCommission(input: {
    transactionType: any;
    customerId?: string;
    providerId?: string;
    gatewayId?: string;
    paymentTermId?: string;
  }) {
    const rules = await this.prisma.commissionRule.findMany({
      where: { transactionType: input.transactionType, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    const candidates = rules.filter((rule) =>
      (!rule.customerId || rule.customerId === input.customerId) &&
      (!rule.providerId || rule.providerId === input.providerId) &&
      (!rule.gatewayId || rule.gatewayId === input.gatewayId) &&
      (!rule.paymentTermId || rule.paymentTermId === input.paymentTermId),
    );

    const ranked = candidates
      .map((rule) => ({
        rule,
        score: [rule.customerId, rule.providerId, rule.gatewayId, rule.paymentTermId]
          .filter(Boolean).length,
      }))
      .sort((a, b) => b.score - a.score);

    const explicitOverride = ranked.find((item) => item.score > 0)?.rule;
    if (explicitOverride) return explicitOverride;

    const serviceDefault = ranked.find((item) => item.score === 0)?.rule;
    if (serviceDefault) return serviceDefault;

    if (
      input.transactionType === 'AEPS_WITHDRAWAL' &&
      input.providerId
    ) {
      const provider = await this.prisma.provider.findUnique({
        where: { id: input.providerId },
        select: {
          id: true,
          supportsAeps: true,
          aepsCommissionRate: true,
          isActive: true,
        },
      });
      if (provider?.isActive && provider.supportsAeps) {
        return {
          id: 'provider-aeps-' + provider.id,
          customerId: null,
          providerId: provider.id,
          gatewayId: null,
          paymentTermId: null,
          transactionType: 'AEPS_WITHDRAWAL',
          commissionType: 'PERCENTAGE',
          commissionRate: provider.aepsCommissionRate,
          isActive: true,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        };
      }
    }

    return ranked[0]?.rule ?? null;
  }
}
