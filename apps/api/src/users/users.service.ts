import { ForbiddenException, Injectable } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
  }

  markLogin(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  list() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        fullName: true,
        mobile: true,
        email: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        role: true,
      },
      orderBy: { fullName: 'asc' },
    });
  }

  async create(dto: CreateUserDto, actorRole: RoleName, actorId: string) {
    if (actorRole !== RoleName.OWNER && dto.role === RoleName.OWNER) {
      throw new ForbiddenException('Only an owner can create another owner');
    }
    const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
    if (!role) throw new Error('Role not found');
    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          fullName: dto.fullName,
          mobile: dto.mobile,
          email: dto.email?.toLowerCase(),
          passwordHash,
          roleId: role.id,
        },
        select: {
          id: true,
          fullName: true,
          mobile: true,
          email: true,
          isActive: true,
          createdAt: true,
          role: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'USER',
          entityId: user.id,
          action: 'CREATE',
          newValues: {
            fullName: user.fullName,
            email: user.email,
            mobile: user.mobile,
            role: user.role.name,
            isActive: user.isActive,
          },
        },
      });

      return user;
    });
  }

  async update(id: string, dto: UpdateUserDto, actorRole: RoleName, actorId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!existing) throw new Error('User not found');
    if (existing.role.name === RoleName.OWNER && actorRole !== RoleName.OWNER) {
      throw new ForbiddenException('Only an owner can edit an owner');
    }
    if (dto.role === RoleName.OWNER && actorRole !== RoleName.OWNER) {
      throw new ForbiddenException('Only an owner can assign the owner role');
    }

    const role = dto.role
      ? await this.prisma.role.findUnique({ where: { name: dto.role } })
      : null;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          fullName: dto.fullName,
          mobile: dto.mobile,
          email: dto.email?.toLowerCase(),
          ...(role ? { roleId: role.id } : {}),
        },
        select: {
          id: true,
          fullName: true,
          mobile: true,
          email: true,
          isActive: true,
          createdAt: true,
          role: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'USER',
          entityId: id,
          action: 'UPDATE',
          oldValues: {
            fullName: existing.fullName,
            mobile: existing.mobile,
            email: existing.email,
            role: existing.role.name,
          },
          newValues: {
            fullName: updated.fullName,
            mobile: updated.mobile,
            email: updated.email,
            role: updated.role.name,
          },
        },
      });

      return updated;
    });
  }

  async setActive(id: string, isActive: boolean, actorRole: RoleName, actorId: string) {
    if (id === actorId && !isActive) {
      throw new ForbiddenException('You cannot disable your own account');
    }

    const existing = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!existing) throw new Error('User not found');
    if (existing.role.name === RoleName.OWNER && actorRole !== RoleName.OWNER) {
      throw new ForbiddenException('Only an owner can change an owner account');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { isActive },
        select: {
          id: true,
          fullName: true,
          mobile: true,
          email: true,
          isActive: true,
          createdAt: true,
          role: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'USER',
          entityId: id,
          action: isActive ? 'REACTIVATE' : 'DEACTIVATE',
          oldValues: { isActive: existing.isActive },
          newValues: { isActive },
        },
      });

      return updated;
    });
  }

  async resetPassword(id: string, password: string, actorRole: RoleName, actorId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!existing) throw new Error('User not found');
    if (existing.role.name === RoleName.OWNER && actorRole !== RoleName.OWNER) {
      throw new ForbiddenException('Only an owner can reset an owner password');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { passwordHash },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'USER',
          entityId: id,
          action: 'PASSWORD_RESET',
        },
      });
    });

    return { success: true };
  }
}
