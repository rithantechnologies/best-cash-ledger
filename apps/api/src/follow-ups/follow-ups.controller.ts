import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CreateFollowUpDto, UpdateFollowUpDto } from './dto.js';
import { FollowUpsService } from './follow-ups.service.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('follow-ups')
export class FollowUpsController {
  constructor(private readonly followUps: FollowUpsService) {}

  @Get('summary') summary() { return this.followUps.summary(); }

  @Get('customer-summary') customerSummary() { return this.followUps.customerSummary(); }

  @Get() list(
    @Query('status') status?: string,
    @Query('kind') kind?: string,
    @Query('customerId') customerId?: string,
  ) { return this.followUps.list({ status, kind, customerId }); }

  @Get(':id') get(@Param('id') id: string) { return this.followUps.get(id); }

  @Post() create(@Body() dto: CreateFollowUpDto, @Req() req: any) {
    return this.followUps.create(dto, req.user.userId);
  }

  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateFollowUpDto, @Req() req: any) {
    return this.followUps.update(id, dto, req.user.userId);
  }
}
