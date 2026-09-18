import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { PayablesController } from './payables.controller.js';
import { PayablesService } from './payables.service.js';

@Module({
  imports: [LedgerModule],
  controllers: [PayablesController],
  providers: [PayablesService],
})
export class PayablesModule {}
