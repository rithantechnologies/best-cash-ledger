import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(entityType?: string, entityId?: string) {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const userIds = [...new Set(rows.map((row) => row.userId))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true, email: true },
        })
      : [];
    const byId = new Map(users.map((user) => [user.id, user]));

    return rows.map((row) => ({
      ...row,
      user: byId.get(row.userId) ?? null,
    }));
  }
}
