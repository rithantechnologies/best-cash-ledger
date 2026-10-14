import { afterEach, describe, expect, it } from 'vitest';
import { CustomersService } from './customers.service.js';

const testNumber = '4242424242424243';
const originalEnabled = process.env.DEMO_CARD_COPY_ENABLED;
const originalKey = process.env.DEMO_CARD_ENCRYPTION_KEY;

const mockService = () => {
  const audits: any[] = [];
  const cards: any[] = [];
  const stored: any[] = [];
  const tx = {
    customerTypeConfig: { findUnique: async () => ({ id: 'type-1', isActive: true, legacyType: 'REGULAR' }) },
    customer: { create: async ({ data }: any) => ({ id: 'existing-customer-1', ...data, isActive: true }), findFirst: async () => null },
    customerCard: {
      create: async ({ data }: any) => { const card = { id: 'saved-card-1', ...data }; cards.push(card); return card; },
      update: async ({ data }: any) => ({ id: 'saved-card-1', ...data }),
    },
    customerDemoCard: {
      create: async ({ data }: any) => { stored.push(data); },
      upsert: async ({ create }: any) => { stored.push(create); },
    },
    auditLog: { create: async ({ data }: any) => { audits.push(data); } },
  };
  const prisma = {
    $transaction: async (fn: (t: any) => Promise<any>) => fn(tx),
    customerCard: { findUnique: async () => ({ id: 'saved-card-1', lastFourDigits: '1234', bankName: 'Old Bank', nickname: null, isActive: true }) },
  };
  return { service: new CustomersService(prisma as never,null as never,null as never,null as never,null as never), cards, stored, audits };
};

describe('existing card and new customer synthetic demo fields', () => {
  afterEach(() => {
    if (originalEnabled === undefined) delete process.env.DEMO_CARD_COPY_ENABLED; else process.env.DEMO_CARD_COPY_ENABLED = originalEnabled;
    if (originalKey === undefined) delete process.env.DEMO_CARD_ENCRYPTION_KEY; else process.env.DEMO_CARD_ENCRYPTION_KEY = originalKey;
  });
  const enable = () => { process.env.DEMO_CARD_COPY_ENABLED = 'true'; process.env.DEMO_CARD_ENCRYPTION_KEY = 'cd'.repeat(32); };

  it('creates a new customer and linked 16-digit demo card atomically, without exposing full value', async () => {
    enable(); const { service, cards, stored, audits } = mockService();
    await service.create({ fullName: 'Example Customer', customerTypeId: 'type-1', demoCardNumber: testNumber, demoCardBank: 'Test Bank' }, 'staff-1');
    expect(cards).toMatchObject([{ customerId: 'existing-customer-1', bankName: 'Test Bank', lastFourDigits: '4243' }]);
    expect(stored).toHaveLength(1);
    expect(stored[0].encryptedValue).not.toContain(testNumber);
    expect(JSON.stringify(audits)).not.toContain(testNumber);
  });

  it('adds an encrypted synthetic number when creating a card for an existing customer', async () => {
    enable(); const { service, cards, stored } = mockService();
    await service.addCard('existing-customer-1', { bankName: 'Test Bank', lastFourDigits: '4243', demoCardNumber: testNumber }, 'staff-1');
    expect(cards[0].lastFourDigits).toBe('4243');
    expect(stored[0].customerCardId).toBe('saved-card-1');
  });

  it('upgrades the existing card record in one transaction, keeping its ID', async () => {
    enable(); const { service, stored, audits } = mockService();
    await service.saveDemoTestNumber('saved-card-1', testNumber, 'staff-1', { bankName: 'Edited Bank', nickname: 'Main' });
    expect(stored[0].customerCardId).toBe('saved-card-1');
    expect(audits[0].newValues).toMatchObject({ lastFourDigits: '4243', bankName: 'Edited Bank' });
    expect(JSON.stringify(audits)).not.toContain(testNumber);
  });
});
