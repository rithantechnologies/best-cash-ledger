import { Global, Module } from '@nestjs/common';
import { FinancialValidationService } from './financial-validation.service.js';
import { IdempotencyService } from './idempotency.service.js';
import { ProviderPayoutChargeService } from './provider-payout-charge.service.js';

@Global()
@Module({
  providers: [FinancialValidationService, IdempotencyService, ProviderPayoutChargeService],
  exports: [FinancialValidationService, IdempotencyService, ProviderPayoutChargeService],
})
export class FinanceModule {}
