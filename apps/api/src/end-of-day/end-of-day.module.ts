import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module.js';
import { EndOfDayController } from './end-of-day.controller.js';
import { EndOfDayService } from './end-of-day.service.js';

@Module({
  imports: [DashboardModule],
  controllers: [EndOfDayController],
  providers: [EndOfDayService],
})
export class EndOfDayModule {}
