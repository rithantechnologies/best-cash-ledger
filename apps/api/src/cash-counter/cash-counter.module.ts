import { Module } from '@nestjs/common';
import { CashCounterController } from './cash-counter.controller.js';
import { CashCounterService } from './cash-counter.service.js';

@Module({
  controllers: [CashCounterController],
  providers: [CashCounterService]
})
export class CashCounterModule {}
