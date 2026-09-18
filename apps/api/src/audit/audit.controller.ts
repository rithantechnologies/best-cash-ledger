import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { AuditService } from './audit.service.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.OWNER, RoleName.ADMIN)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query('entityType') entityType?: string, @Query('entityId') entityId?: string) {
    return this.audit.list(entityType, entityId);
  }
}
