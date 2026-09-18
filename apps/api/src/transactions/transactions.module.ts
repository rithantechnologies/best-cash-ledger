import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { ProviderSettlementsModule } from '../provider-settlements/provider-settlements.module.js';
import { TransactionsController } from './transactions.controller.js';
import { TransactionsService } from './transactions.service.js';

@Module({
  imports: [LedgerModule, ProviderSettlementsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
