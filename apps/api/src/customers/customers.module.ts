import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { CustomersController } from './customers.controller.js';
import { CustomersService } from './customers.service.js';
import { BankDirectoryService } from './bank-directory.service.js';

@Module({
  imports: [LedgerModule],
  controllers: [CustomersController],
  providers: [CustomersService, BankDirectoryService]
})
export class CustomersModule {}
