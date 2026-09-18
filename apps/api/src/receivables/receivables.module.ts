import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { ReceivablesController } from './receivables.controller.js';
import { ReceivablesService } from './receivables.service.js';

@Module({
  imports: [LedgerModule],
  controllers: [ReceivablesController],
  providers: [ReceivablesService],
})
export class ReceivablesModule {}
