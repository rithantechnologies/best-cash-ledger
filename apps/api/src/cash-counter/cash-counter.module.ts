import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { CashCounterController } from './cash-counter.controller.js';
import { CashCounterService } from './cash-counter.service.js';

@Module({
  imports: [LedgerModule],
  controllers: [CashCounterController],
  providers: [CashCounterService]
})
export class CashCounterModule {}
