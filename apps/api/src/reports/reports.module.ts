import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { ExcelExportService } from './excel-export.service.js';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ExcelExportService]
})
export class ReportsModule {}
