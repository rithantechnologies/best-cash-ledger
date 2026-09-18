import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { ProviderSettlementsController } from './provider-settlements.controller.js';
import { ProviderSettlementsService } from './provider-settlements.service.js';

@Module({
  imports: [LedgerModule],
  controllers: [ProviderSettlementsController],
  providers: [ProviderSettlementsService],
  exports: [ProviderSettlementsService],
})
export class ProviderSettlementsModule {}
