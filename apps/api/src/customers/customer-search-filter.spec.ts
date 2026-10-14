import { describe, expect, it } from 'vitest';
import { customerSearchFilter } from './customer-search-filter.js';

const serialized = (query: string) => JSON.stringify(customerSearchFilter(query));

describe('customer search filter', () => {
  it('matches bank account fragments and credit-card last four digits', () => {
    const filter = serialized('0247');
    expect(filter).toContain('accountReference');
    expect(filter).toContain('lastFourDigits');
    expect(filter).toContain('mobileNumber');
    expect(filter).toContain('aadhaarLastFour');
  });

  it('searches card, bank, UPI, and beneficiary fields', () => {
    const filter = serialized('sample@upi');
    expect(filter).toContain('bankAccounts');
    expect(filter).toContain('upiAccounts');
    expect(filter).toContain('beneficiaries');
    expect(filter).toContain('upiId');
    expect(filter).toContain('beneficiaryName');
  });

  it('requires each space-separated term to match on the same customer', () => {
    const filter = customerSearchFilter('TMB 0247');
    expect(filter.AND).toHaveLength(2);
    expect(JSON.stringify(filter.AND)).toContain('0247');
    expect(JSON.stringify(filter.AND)).toContain('TMB');
  });

  it('also matches EB consumer numbers when looking up existing customers', () => {
    const filter = serialized('00123456789');
    expect(filter).toContain('ebNumber');
    expect(filter).toContain('00123456789');
  });

  it('removes formatting from copied account numbers typed into search', () => {
    expect(serialized('0791-000602-00247')).toContain('079100060200247');
  });
});
