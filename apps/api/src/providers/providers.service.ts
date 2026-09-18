import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateGatewayDto } from './dto/create-gateway.dto.js';
import { CreateProviderDto } from './dto/create-provider.dto.js';
import { UpdateGatewayDto } from './dto/update-gateway.dto.js';
import { UpdateProviderDto } from './dto/update-provider.dto.js';

@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  list(includeInactive = false) {
    return this.prisma.provider.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: {
        gateways: includeInactive ? true : { where: { isActive: true } },
        accounts: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  create(dto: CreateProviderDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const provider = await tx.provider.create({ data: dto });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'PROVIDER',
          entityId: provider.id,
          action: 'CREATE',
          newValues: {
            name: provider.name,
            providerType: provider.providerType,
            isActive: provider.isActive,
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
      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'PROVIDER',
          entityId: id,
          action: 'UPDATE',
          oldValues: { name: existing.name, providerType: existing.providerType, notes: existing.notes },
          newValues: { name: updated.name, providerType: updated.providerType, notes: updated.notes },
        },
      });
      return updated;
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
