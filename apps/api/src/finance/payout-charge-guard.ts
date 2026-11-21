import { BadRequestException } from '@nestjs/common';

// Protect customer payout principal from accidentally being entered as a provider fee.
// An explicit, server-resolved provider slab may exceed the manual-entry threshold,
// but a charge can never consume the whole amount being paid to the customer.
export function validateCustomerPayoutCharge(
  payoutAmount: number,
  chargeAmount: number,
  fromConfiguredRule = false,
): void {
  if (!Number.isFinite(payoutAmount) || payoutAmount <= 0 ||
      !Number.isFinite(chargeAmount) || chargeAmount < 0) {
    throw new BadRequestException('Invalid customer payout or provider charge amount');
  }

  const payoutPaise = Math.round(payoutAmount * 100);
  const chargePaise = Math.round(chargeAmount * 100);
  if (chargePaise >= payoutPaise && chargePaise > 0) {
    throw new BadRequestException(
      'Provider payout charge cannot equal or exceed the customer payout. Check fee versus payout amount.',
    );
  }
  if (!fromConfiguredRule && chargePaise > Math.round(payoutPaise * 0.10)) {
    throw new BadRequestException(
      'Manual provider payout charge exceeds 10% of the customer payout. Check fee versus payout; configure an approved provider charge slab for a higher fee.',
    );
  }
}
