import { Global, Module } from '@nestjs/common';
import { FinancialValidationService } from './financial-validation.service.js';
import { IdempotencyService } from './idempotency.service.js';

@Global()
@Module({
  providers: [FinancialValidationService, IdempotencyService],
  exports: [FinancialValidationService, IdempotencyService],
})
export class FinanceModule {}
