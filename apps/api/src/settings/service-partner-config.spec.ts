import { describe, expect, it, vi } from 'vitest';
import { SettingsService } from './settings.service.js';

function setup(existing = {
  id: 'service-1',
  name: 'Aadhaar Address Correction',
  defaultAmount: null,
  allowPartnerFulfillment: false,
  partnerOnly: false,
  partnerNames: [] as string[],
  defaultPartnerName: null,
  defaultPartnerCharge: null,
}) {
  const serviceCatalog = {
    findUnique: vi.fn(async () => existing),
    create: vi.fn(async ({ data }: any) => ({ id: 'service-1', isActive: true, ...data })),
    update: vi.fn(async ({ data }: any) => ({ ...existing, ...data })),
  };
  const auditLog = { create: vi.fn(async () => ({})) };
  const tx = { serviceCatalog, auditLog };
  const prisma: any = { ...tx, $transaction: async (callback: any) => callback(tx) };
  return { service: new SettingsService(prisma), serviceCatalog, auditLog };
}

describe('service partner configuration', () => {
  it('creates partner-only services with deduplicated partner suggestions and an audit record', async () => {
    const { service, serviceCatalog, auditLog } = setup();
    await service.createService({
      name: 'Address Correction',
      partnerOnly: true,
      partnerNames: [' Studio A ', 'studio a', 'Studio B'],
      defaultPartnerName: 'Studio A',
    }, 'owner');
    expect(serviceCatalog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        allowPartnerFulfillment: true,
        partnerOnly: true,
        partnerNames: ['Studio A', 'Studio B'],
      }),
    }));
    expect(auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'CREATE',
        newValues: expect.objectContaining({ partnerOnly: true }),
      }),
    }));
  });

  it('switches between both, partner-only and us-only without leaving a contradictory mode', async () => {
    const { service, serviceCatalog } = setup();
    await service.updateService('service-1', { allowPartnerFulfillment: true }, 'owner');
    expect(serviceCatalog.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ allowPartnerFulfillment: true, partnerOnly: false }),
    }));
    await service.updateService('service-1', { partnerOnly: true }, 'owner');
    expect(serviceCatalog.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ allowPartnerFulfillment: true, partnerOnly: true }),
    }));
    const configured = setup({ id: 'service-1', name: 'Aadhaar Address Correction', defaultAmount: null,
      allowPartnerFulfillment: true, partnerOnly: true, partnerNames: ['Partner A'],
      defaultPartnerName: null, defaultPartnerCharge: null });
    await configured.service.updateService('service-1', { allowPartnerFulfillment: false }, 'owner');
    expect(configured.serviceCatalog.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ allowPartnerFulfillment: false, partnerOnly: false }),
    }));
  });
});
