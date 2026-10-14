import { afterEach, describe, expect, it } from 'vitest';
import { CustomersService } from './customers.service.js';

const demoKey = 'ab'.repeat(32);

describe('development-only synthetic card numbers', () => {
  const originalEnabled = process.env.DEMO_CARD_COPY_ENABLED;
  const originalKey = process.env.DEMO_CARD_ENCRYPTION_KEY;

  afterEach(() => {
    if (originalEnabled === undefined) delete process.env.DEMO_CARD_COPY_ENABLED;
    else process.env.DEMO_CARD_COPY_ENABLED = originalEnabled;
    if (originalKey === undefined) delete process.env.DEMO_CARD_ENCRYPTION_KEY;
    else process.env.DEMO_CARD_ENCRYPTION_KEY = originalKey;
  });

  const fixture = () => {
    let stored = '';
    const card = { id: 'card-1', bankName: 'Old Bank', nickname: 'Old Card', lastFourDigits: '4243', isActive: true };
    const audit: unknown[] = [];
    const prisma = {
      customerCard: { findUnique: async () => ({ ...card }) },
      customerDemoCard: { findUnique: async () => ({ encryptedValue: stored, customerCard: { isActive: true } }) },
      auditLog: { create: async (args: unknown) => { audit.push(args); } },
      $transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb({
        customerCard: { update: async (args: { data: Partial<typeof card> }) => { Object.assign(card, args.data); return { ...card }; } },
        customerDemoCard: { upsert: async (args: { create: { encryptedValue: string } }) => { stored = args.create.encryptedValue; } },
        auditLog: { create: async (args: unknown) => { audit.push(args); } },
      }),
    };
    const service = new CustomersService(prisma as never, null as never, null as never, null as never, null as never);
    return { service, audit, getStored: () => stored, getCard: () => ({ ...card }) };
  };

  it('accepts a user-typed invalid-Luhn sample, masks it in audit, and decrypts for Copy', async () => {
    process.env.DEMO_CARD_COPY_ENABLED = 'true';
    process.env.DEMO_CARD_ENCRYPTION_KEY = demoKey;
    const { service, audit, getStored } = fixture();
    await service.saveDemoTestNumber('card-1', '4242424242424243', 'staff-1');
    expect(getStored()).not.toContain('4242424242424243');
    expect((await service.copyDemoTestNumber('card-1', 'staff-1')).demoNumber).toBe('4242424242424243');
    expect(JSON.stringify(audit)).not.toContain('4242424242424243');
    expect(audit).toHaveLength(2);
  });

  it('upgrades an existing last-four-only card in one transaction without replacing its ID', async () => {
    process.env.DEMO_CARD_COPY_ENABLED = 'true';
    process.env.DEMO_CARD_ENCRYPTION_KEY = demoKey;
    const { service, audit, getCard } = fixture();
    await service.saveDemoTestNumber('card-1', '4242424242424244', 'staff-1', { bankName: 'New Bank', nickname: 'Demo Card' });
    expect(getCard()).toMatchObject({ id: 'card-1', lastFourDigits: '4244', bankName: 'New Bank', nickname: 'Demo Card' });
    expect((await service.copyDemoTestNumber('card-1', 'staff-1')).demoNumber).toBe('4242424242424244');
    expect(audit).toHaveLength(3);
    expect(JSON.stringify(audit)).not.toContain('4242424242424244');
  });

  it('does not change existing last four from a standalone demo-number request', async () => {
    process.env.DEMO_CARD_COPY_ENABLED = 'true';
    process.env.DEMO_CARD_ENCRYPTION_KEY = demoKey;
    const { service, getCard } = fixture();
    await expect(service.saveDemoTestNumber('card-1', '4242424242424244', 'staff-1')).rejects.toThrow('must match');
    expect(getCard().lastFourDigits).toBe('4243');
  });

  it('allows exactly sixteen zeros, including a Luhn-valid number, in demo mode', async () => {
    process.env.DEMO_CARD_COPY_ENABLED = 'true';
    process.env.DEMO_CARD_ENCRYPTION_KEY = demoKey;
    const { service, audit, getStored, getCard } = fixture();
    const value = '0000000000000000';
    await service.saveDemoTestNumber('card-1', value, 'staff-1', { bankName: 'Demo Bank' });
    expect(getCard().lastFourDigits).toBe('0000');
    expect(getStored()).not.toContain(value);
    expect((await service.copyDemoTestNumber('card-1', 'staff-1')).demoNumber).toBe(value);
    expect(JSON.stringify(audit)).not.toContain(value);
  });

  it('rejects values other than 16 digits and does not accept real card storage when disabled', async () => {
    process.env.DEMO_CARD_COPY_ENABLED = 'true';
    process.env.DEMO_CARD_ENCRYPTION_KEY = demoKey;
    const { service } = fixture();
    await expect(service.saveDemoTestNumber('card-1', '1234', 'staff-1')).rejects.toThrow('exactly 16 digits');
    process.env.DEMO_CARD_COPY_ENABLED = 'false';
    await expect(service.saveDemoTestNumber('card-1', '4242424242424243', 'staff-1')).rejects.toThrow('disabled');
  });
});
