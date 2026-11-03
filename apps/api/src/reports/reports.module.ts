import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { ExcelExportService } from './excel-export.service.js';
import { CardSwipeReportService } from './card-swipe-report.service.js';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ExcelExportService, CardSwipeReportService]
})
export class ReportsModule {}
