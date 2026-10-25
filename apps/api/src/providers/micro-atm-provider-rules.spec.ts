import { CalculationType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ProvidersService } from './providers.service.js';

function setup() {
  const old = [{ id: 'old', minAmount: 2000, maxAmount: 2999,
    calculationType: CalculationType.FIXED, value: 3 }];
  const tx: any = {
    provider: { findUnique: vi.fn().mockResolvedValue({ id: 'roinet' }) },
    microAtmProviderCommissionRule: {
      findMany: vi.fn().mockResolvedValueOnce(old).mockResolvedValueOnce([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma: any = { $transaction: (fn: (client: any) => Promise<unknown>) => fn(tx) };
  return { service: new ProvidersService(prisma), tx };
}

describe('Micro ATM provider commission rule configuration', () => {
  it('closes existing slabs, writes new dated slabs and audits the change', async () => {
    const { service, tx } = setup();
    await service.setMicroAtmProviderCommissionRules('roinet', {
      rules: [
        { minAmount: 3000, maxAmount: 3999, calculationType: CalculationType.FIXED, value: 9 },
        { minAmount: 2000, maxAmount: 2999, calculationType: CalculationType.FIXED, value: 4 },
      ],
    }, 'owner');
    expect(tx.microAtmProviderCommissionRule.updateMany).toHaveBeenCalledWith({
      where: { providerId: 'roinet', effectiveTo: null },
      data: { effectiveTo: expect.any(Date) },
    });
    const rows = tx.microAtmProviderCommissionRule.createMany.mock.calls[0][0].data;
    expect(rows.map((row: any) => [row.minAmount, row.value])).toEqual([[2000, 4], [3000, 9]]);
    expect(rows[0].effectiveFrom).toEqual(rows[1].effectiveFrom);
    expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'UPDATE', entityType: 'MICRO_ATM_PROVIDER_COMMISSION_RULES',
      oldValues: [{ minAmount: '2000', maxAmount: '2999', calculationType: 'FIXED', value: '3' }],
    });
  });
  it('rejects overlapping slabs before touching the database', async () => {
    const { service, tx } = setup();
    await expect(service.setMicroAtmProviderCommissionRules('roinet', {
      rules: [
        { minAmount: 2000, maxAmount: 2999, calculationType: CalculationType.FIXED, value: 4 },
        { minAmount: 2900, maxAmount: 3999, calculationType: CalculationType.FIXED, value: 9 },
      ],
    }, 'owner')).rejects.toThrow(/cannot overlap/);
    expect(tx.provider.findUnique).not.toHaveBeenCalled();
  });
});
