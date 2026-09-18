import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CreateGatewayDto } from './dto/create-gateway.dto.js';
import { CreateProviderDto } from './dto/create-provider.dto.js';
import { SetProviderActiveDto } from './dto/set-provider-active.dto.js';
import { UpdateGatewayDto } from './dto/update-gateway.dto.js';
import { UpdateProviderDto } from './dto/update-provider.dto.js';
import { ProvidersService } from './providers.service.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('providers')
export class ProvidersController {
  constructor(private readonly providers: ProvidersService) {}

  @Get()
  list(@Query('includeInactive') includeInactive?: string) {
    return this.providers.list(includeInactive === 'true');
  }

  @Post()
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  create(@Body() dto: CreateProviderDto, @Req() req: any) {
    return this.providers.create(dto, req.user.userId);
  }

  @Post(':id/gateways')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  addGateway(@Param('id') id: string, @Body() dto: CreateGatewayDto, @Req() req: any) {
    return this.providers.addGateway(id, dto, req.user.userId);
  }

  @Patch(':id')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  updateProvider(@Param('id') id: string, @Body() dto: UpdateProviderDto, @Req() req: any) {
    return this.providers.updateProvider(id, dto, req.user.userId);
  }

  @Patch(':id/active')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  setProviderActive(@Param('id') id: string, @Body() dto: SetProviderActiveDto, @Req() req: any) {
    return this.providers.setProviderActive(id, dto.isActive, req.user.userId);
  }

  @Patch('gateways/:id')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  updateGateway(@Param('id') id: string, @Body() dto: UpdateGatewayDto, @Req() req: any) {
    return this.providers.updateGateway(id, dto, req.user.userId);
  }

  @Patch('gateways/:id/active')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  setGatewayActive(@Param('id') id: string, @Body() dto: SetProviderActiveDto, @Req() req: any) {
    return this.providers.setGatewayActive(id, dto.isActive, req.user.userId);
  }
}
