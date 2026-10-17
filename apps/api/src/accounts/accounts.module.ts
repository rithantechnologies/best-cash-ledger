import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { WalletReconciliationService } from './wallet-reconciliation.service.js';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';
import { AccountImagesService } from './account-images.service.js';

@Module({
  imports: [LedgerModule],
  controllers: [AccountsController],
  providers: [AccountsService, AccountImagesService, WalletReconciliationService]
})
export class AccountsModule {}
