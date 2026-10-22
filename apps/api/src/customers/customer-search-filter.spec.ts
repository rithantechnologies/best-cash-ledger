import { describe, expect, it } from 'vitest';
import { customerSearchFilter, findCustomerIdsForSearch } from './customer-search-filter.js';

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

  it('matches additional saved EB connections by number or nickname', () => {
    expect(serialized('0320700614650')).toContain('serviceProfiles');
    expect(serialized('Owner House')).toContain('nickname');
    expect(serialized('0320700614650')).toContain('referenceNumber');
    expect(serialized('Owner House')).toContain('ownerName');
  });

  it('finds customer E-Sevai services by the saved E-Sevai name or service type', () => {
    expect(serialized('Lakshmi')).toContain('esevaiName');
    expect(serialized('Income Certificate')).toContain('serviceName');
    expect(serialized('Income Certificate')).toContain('esevaiServices');
  });

  it('matches saved AEPS records by bank, holder and 12-digit PR number', () => {
    const filter = serialized('123456789012');
    expect(filter).toContain('aepsAccounts');
    expect(filter).toContain('prNumber');
    expect(filter).toContain('aadhaarLastSix');
    expect(serialized('State Bank')).toContain('bankName');
    expect(serialized('Anitha')).toContain('holderName');
  });

  it('removes formatting from copied account numbers typed into search', () => {
    expect(serialized('0791-000602-00247')).toContain('079100060200247');
  });
});


// Focused fast-path tests: do not expose or depend on production customer data.
describe('indexed mobile search', () => {
  it('uses one exact indexed lookup when a ten-digit customer mobile matches', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'matched' }]);
    const ids = await findCustomerIdsForSearch({ customer: { findMany } } as any, '9876543210');
    expect(ids).toEqual(['matched']);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { isActive: true, mobile: '9876543210' },
      select: { id: true },
    });
  });

  it('keeps inactive-customer visibility for admins', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'inactive' }]);
    expect(await findCustomerIdsForSearch({ customer: { findMany } } as any, ' 9876543210 ', true))
      .toEqual(['inactive']);
    expect(findMany.mock.calls[0][0].where).toEqual({ mobile: '9876543210' });
  });

  it('falls back to bank/UPI and other details when phone does not match', async () => {
    const findMany = vi.fn().mockImplementation(async ({ where }: any) => {
      if (typeof where.mobile === 'string') return [];
      if (where.bankAccounts) return [{ id: 'saved-bank' }];
      return [];
    });
    expect(await findCustomerIdsForSearch({ customer: { findMany } } as any, '9876543210'))
      .toEqual(['saved-bank']);
    expect(findMany.mock.calls.length).toBeGreaterThan(1);
    expect(findMany.mock.calls.some(([query]: any[]) => !!query.where.bankAccounts)).toBe(true);
  });

  it('does not mistake card fragments or longer references for an exact phone', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await findCustomerIdsForSearch({ customer: { findMany } } as any, '0247');
    expect(findMany.mock.calls.some(([query]: any[]) => typeof query.where.mobile === 'string'))
      .toBe(false);
    findMany.mockClear();
    await findCustomerIdsForSearch({ customer: { findMany } } as any, '919876543210');
    expect(findMany.mock.calls.some(([query]: any[]) => typeof query.where.mobile === 'string'))
      .toBe(false);
  });
});
