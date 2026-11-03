import { describe, expect, it } from 'vitest';
import { cashPayoutRounding } from './payables.service.js';

describe('nearest rupee physical cash payout', () => {
  it('settles 2 paise without a wallet transfer', () => {
    expect(cashPayoutRounding(57524.02, 57524, true)).toBe(0.02);
  });
  it('records a negative adjustment when paying up to the nearest rupee', () => {
    expect(cashPayoutRounding(57524.98, 57525, true)).toBe(-0.02);
    expect(cashPayoutRounding(57524.50, 57525, true)).toBe(-0.50);
  });
  it('does not round bank transfers, partial cash payments, or larger discrepancies', () => {
    expect(cashPayoutRounding(57524.02, 57524, false)).toBe(0);
    expect(cashPayoutRounding(57524.02, 50000, true)).toBe(0);
    expect(cashPayoutRounding(57524.02, 57525, true)).toBe(0);
    expect(cashPayoutRounding(0.02, 0, true)).toBe(0);
  });
});
