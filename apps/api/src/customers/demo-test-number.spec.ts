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
    const audit: unknown[] = [];
    const prisma = {
      customerCard: { findUnique: async () => ({ lastFourDigits: '4243', isActive: true }) },
      customerDemoCard: { findUnique: async () => ({ encryptedValue: stored, customerCard: { isActive: true } }) },
      auditLog: { create: async (args: unknown) => { audit.push(args); } },
      $transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb({
        customerDemoCard: { upsert: async (args: { create: { encryptedValue: string } }) => { stored = args.create.encryptedValue; } },
        auditLog: { create: async (args: unknown) => { audit.push(args); } },
      }),
    };
    const service = new CustomersService(prisma as never, null as never, null as never, null as never, null as never);
    return { service, audit, getStored: () => stored };
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

  it('rejects real-looking checksum-valid card values', async () => {
    process.env.DEMO_CARD_COPY_ENABLED = 'true';
    process.env.DEMO_CARD_ENCRYPTION_KEY = demoKey;
    const { service } = fixture();
    await expect(service.saveDemoTestNumber('card-1', '4539578763621486', 'staff-1')).rejects.toThrow('dummy number');
  });

  it('rejects values other than 16 digits and does not accept real card storage when disabled', async () => {
    process.env.DEMO_CARD_COPY_ENABLED = 'true';
    process.env.DEMO_CARD_ENCRYPTION_KEY = demoKey;
    const { service } = fixture();
    await expect(service.saveDemoTestNumber('card-1', '1234', 'staff-1')).rejects.toThrow('dummy number');
    process.env.DEMO_CARD_COPY_ENABLED = 'false';
    await expect(service.saveDemoTestNumber('card-1', '4242424242424243', 'staff-1')).rejects.toThrow('disabled');
  });
});
