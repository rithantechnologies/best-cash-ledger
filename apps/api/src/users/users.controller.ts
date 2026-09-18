import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { SetUserActiveDto } from './dto/set-user-active.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UsersService } from './users.service.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.OWNER, RoleName.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post()
  create(@Body() dto: CreateUserDto, @Req() req: any) {
    return this.users.create(dto, req.user.role, req.user.userId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: any) {
    return this.users.update(id, dto, req.user.role, req.user.userId);
  }

  @Patch(':id/active')
  setActive(@Param('id') id: string, @Body() dto: SetUserActiveDto, @Req() req: any) {
    return this.users.setActive(id, dto.isActive, req.user.role, req.user.userId);
  }

  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto, @Req() req: any) {
    return this.users.resetPassword(id, dto.password, req.user.role, req.user.userId);
  }
}
