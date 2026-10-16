import { describe, expect, it, vi } from 'vitest';
import { CustomersService } from './customers.service.js';

function setup() {
  const records: Array<{ id: string; customerId: string; bankName: string; holderName: string; prNumber: string | null; aadhaarLastSix?: string | null; isActive: boolean }> = [];
  const tx = {
    customer: { findUnique: vi.fn(async () => ({ id: 'customer-1' })) },
    customerAepsAccount: {
      create: vi.fn(async ({ data }: any) => {
        const result = { id: 'aeps-' + (records.length + 1), ...data, isActive: true };
        records.push(result);
        return result;
      }),
      findUnique: vi.fn(async ({ where }: any) => records.find(item => item.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        const item = records.find(row => row.id === where.id);
        if (!item) throw new Error('Missing test AEPS');
        Object.assign(item, data);
        return { ...item };
      }),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  const db = { $transaction: (callback: (tx: any) => Promise<any>) => callback(tx) };
  const service = new CustomersService(db as any, {} as any, {} as any, {} as any, {} as any);
  return { service, tx, records };
}

describe('customer AEPS saved accounts', () => {
  it('stores multiple banks and holders even when their PR numbers are identical', async () => {
    const { service, records, tx } = setup();
    const first = await service.addAepsAccount('customer-1', { bankName: 'Bank One', holderName: 'Kumar', prNumber: '123456789012' }, 'staff-1');
    const second = await service.addAepsAccount('customer-1', { bankName: 'Bank Two', holderName: 'Amudha', prNumber: '123456789012' }, 'staff-1');
    expect(records).toHaveLength(2);
    expect(first.id).not.toBe(second.id);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid PR numbers, non-digits and blank names', async () => {
    const { service, tx } = setup();
    expect(() => service.addAepsAccount('customer-1', { bankName: 'Bank', holderName: 'Kumar', prNumber: '123456' }, 'staff-1')).toThrow('12 digits');
    expect(() => service.addAepsAccount('customer-1', { bankName: 'Bank', holderName: 'Kumar', prNumber: '12A456789012' }, 'staff-1')).toThrow('12 digits');
    expect(() => service.addAepsAccount('customer-1', { bankName: '  ', holderName: 'Kumar', prNumber: '123456789012' }, 'staff-1')).toThrow('Bank');
    expect(tx.customerAepsAccount.create).not.toHaveBeenCalled();
  });

  it('replaces a legacy six-digit reference when a 12-digit PR number is saved', async () => {
    const { service, records, tx } = setup();
    records.push({ id: 'aeps-old', customerId: 'customer-1', bankName: 'Old Bank', holderName: 'Mina',
      aadhaarLastSix: '654321', prNumber: null, isActive: true });
    await service.updateAepsAccount('aeps-old', { prNumber: '012345678901' }, 'staff-2');
    expect(records[0]).toMatchObject({ prNumber: '012345678901', aadhaarLastSix: '654321' });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain('012345678901');
  });

  it('edits and retires one entry while retaining the other', async () => {
    const { service, records, tx } = setup();
    await service.addAepsAccount('customer-1', { bankName: 'Bank One', holderName: 'Kumar', prNumber: '123456789012' }, 'staff-1');
    await service.addAepsAccount('customer-1', { bankName: 'Bank Two', holderName: 'Amudha', prNumber: '123456789012' }, 'staff-1');
    await service.updateAepsAccount('aeps-1', { bankName: 'Bank Three' }, 'staff-2');
    await service.setAepsAccountActive('aeps-1', false, 'staff-2');
    expect(records[0]).toMatchObject({ bankName: 'Bank Three', isActive: false });
    expect(records[1]).toMatchObject({ bankName: 'Bank Two', isActive: true });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(4);
  });
});
