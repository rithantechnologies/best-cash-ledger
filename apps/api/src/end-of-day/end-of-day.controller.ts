import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { EndOfDayService } from './end-of-day.service.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('end-of-day')
export class EndOfDayController {
  constructor(private readonly endOfDay: EndOfDayService) {}

  @Get('status')
  status() {
    return this.endOfDay.status();
  }

  @Get('history')
  history() {
    return this.endOfDay.history();
  }

  @Post('snapshot')
  @Roles(RoleName.OWNER, RoleName.ADMIN)
  snapshot(@Req() req: any) {
    return this.endOfDay.snapshot(req.user.userId);
  }
}
