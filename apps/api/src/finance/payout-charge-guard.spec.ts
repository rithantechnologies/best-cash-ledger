import { BadRequestException } from '@nestjs/common';
import { validateCustomerPayoutCharge } from './payout-charge-guard.js';

describe('customer payout charge safety', () => {
  it('accepts ordinary manually entered provider fees and zero', () => {
    expect(() => validateCustomerPayoutCharge(29310, 25)).not.toThrow();
    expect(() => validateCustomerPayoutCharge(29310, 0)).not.toThrow();
  });
  it('blocks pasting the customer payout principal as its charge', () => {
    expect(() => validateCustomerPayoutCharge(29310, 29310)).toThrow(/cannot equal or exceed/);
    expect(() => validateCustomerPayoutCharge(2500, 2501)).toThrow(BadRequestException);
  });
  it('blocks an extreme manual charge before any financial posting', () => {
    expect(() => validateCustomerPayoutCharge(29310, 4000)).toThrow(/exceeds 10%/);
    expect(() => validateCustomerPayoutCharge(29310, 2931)).not.toThrow();
  });
  it('supports approved provider-slab fees while still guarding principal', () => {
    expect(() => validateCustomerPayoutCharge(1000, 120, true)).not.toThrow();
    expect(() => validateCustomerPayoutCharge(1000, 1000, true)).toThrow(/cannot equal or exceed/);
  });
  it('rejects negative, missing and nonfinite amounts', () => {
    expect(() => validateCustomerPayoutCharge(0, 0)).toThrow();
    expect(() => validateCustomerPayoutCharge(29310, NaN)).toThrow();
    expect(() => validateCustomerPayoutCharge(29310, -1)).toThrow();
  });
});
