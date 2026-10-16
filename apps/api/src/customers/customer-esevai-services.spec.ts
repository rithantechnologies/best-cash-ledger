import { describe, expect, it, vi } from 'vitest';
import { CustomersService } from './customers.service.js';

function setup() {
  const records: Array<{ id: string; customerId: string; esevaiName: string; serviceName: string; isActive: boolean }> = [];
  const tx = {
    customer: { findUnique: vi.fn(async () => ({ id: 'customer-1' })) },
    customerEsevaiService: {
      create: vi.fn(async ({ data }: any) => {
        const record = { id: 'es-' + (records.length + 1), ...data, isActive: true };
        records.push(record);
        return record;
      }),
      findUnique: vi.fn(async ({ where }: any) => records.find(row => row.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        const record = records.find(row => row.id === where.id);
        if (!record) throw new Error('Missing E-Sevai record');
        Object.assign(record, data);
        return { ...record };
      }),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  const db = { $transaction: (callback: (tx: any) => Promise<any>) => callback(tx) };
  const service = new CustomersService(db as any, {} as any, {} as any, {} as any, {} as any);
  return { service, tx, records };
}

describe('customer E-Sevai services', () => {
  it('saves multiple distinct services, even for the same E-Sevai name', async () => {
    const { service, records, tx } = setup();
    await service.addEsevaiService('customer-1', { esevaiName: 'Lakshmi', serviceName: 'Income Certificate' }, 'staff-1');
    await service.addEsevaiService('customer-1', { esevaiName: 'Lakshmi', serviceName: 'Community Certificate' }, 'staff-1');
    expect(records).toHaveLength(2);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
  });

  it('validates blank names and overlong services before writing anything', () => {
    const { service, tx } = setup();
    expect(() => service.addEsevaiService('customer-1', { esevaiName: '  ', serviceName: 'Income Certificate' }, 'staff-1')).toThrow('required');
    expect(() => service.addEsevaiService('customer-1', { esevaiName: 'Lakshmi', serviceName: 'X'.repeat(151) }, 'staff-1')).toThrow('maximum');
    expect(tx.customerEsevaiService.create).not.toHaveBeenCalled();
  });

  it('edits and retires only the selected service with audit history', async () => {
    const { service, records, tx } = setup();
    await service.addEsevaiService('customer-1', { esevaiName: 'Lakshmi', serviceName: 'Income Certificate' }, 'staff-1');
    await service.addEsevaiService('customer-1', { esevaiName: 'Ravi', serviceName: 'Aadhaar Lamination' }, 'staff-1');
    await service.updateEsevaiService('es-1', { esevaiName: 'Meena', serviceName: 'Nativity Certificate' }, 'staff-2');
    await service.setEsevaiServiceActive('es-1', false, 'staff-2');
    expect(records[0]).toMatchObject({ esevaiName: 'Meena', serviceName: 'Nativity Certificate', isActive: false });
    expect(records[1]).toMatchObject({ esevaiName: 'Ravi', isActive: true });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(4);
  });
});
