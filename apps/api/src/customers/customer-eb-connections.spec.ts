import { describe, expect, it, vi } from 'vitest';
import { CustomersService } from './customers.service.js';

describe('customer detail EB connection compatibility', () => {
  it('includes saved EB connections and consumer names in the customer detail API response', async () => {
    const profiles = [
      {
        id: 'connection-1',
        serviceName: 'Eb Bill',
        referenceNumber: 'TEST000123',
        ownerName: 'Sample Consumer',
        nickname: null,
        isActive: true,
      },
    ];
    const customer = {
      id: 'customer-1',
      fullName: 'Sample Customer',
      cards: [],
      bankAccounts: [],
      upiAccounts: [],
      beneficiaries: [],
      payables: [],
      receivables: [],
      transactions: [],
      serviceProfiles: profiles,
    };
    const findUnique = vi.fn().mockResolvedValue(customer);
    const prisma = { customer: { findUnique } };
    const service = new CustomersService(
      prisma as never,
      null as never,
      null as never,
      null as never,
      null as never,
    );

    const result = await service.get('customer-1');

    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'customer-1' },
      include: expect.objectContaining({
        serviceProfiles: expect.objectContaining({
          where: { serviceName: 'Eb Bill' },
        }),
      }),
    }));
    expect(result.serviceProfiles).toEqual(profiles);
    expect(result.serviceProfiles[0].ownerName).toBe('Sample Consumer');
  });
});
