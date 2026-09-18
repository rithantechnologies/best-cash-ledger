import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ReceivableStatus, RoleName } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CancelReceivableDto } from './dto/cancel-receivable.dto.js';
import { CreateReceivableCollectionDto } from './dto/create-receivable-collection.dto.js';
import { CreateReceivableDto } from './dto/create-receivable.dto.js';
import { ReceivablesService } from './receivables.service.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('receivables')
export class ReceivablesController {
  constructor(private readonly receivables: ReceivablesService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
    @Query('status') status?: ReceivableStatus,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
  ) {
    return this.receivables.list({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      q,
      status,
      sortBy,
      sortDir,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.receivables.get(id);
  }

  @Post()
  create(@Body() dto: CreateReceivableDto, @Req() req: any) {
    return this.receivables.create(dto, req.user.userId);
  }

  @Post(':id/collections')
  collect(
    @Param('id') id: string,
    @Body() dto: CreateReceivableCollectionDto,
    @Req() req: any,
  ) {
    return this.receivables.collect(id, dto, req.user.userId);
  }

  @Post(':id/cancel')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelReceivableDto,
    @Req() req: any,
  ) {
    return this.receivables.cancel(id, dto, req.user.userId);
  }
}

