import { AccountType, RoleName } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { CustomersService } from './customers.service.js';
import type { CreateCustomerLedgerEntryDto } from './dto/create-customer-ledger-entry.dto.js';

function setup(accountType: AccountType) {
  const tx = { transaction: { create: vi.fn() } };
  const prisma = { $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) };
  const validation = {
    activeCustomer: vi.fn().mockResolvedValue(undefined),
    lockAccount: vi.fn().mockResolvedValue(undefined),
    liquidAsset: vi.fn().mockResolvedValue({
      id: 'account-1',
      accountType,
      accountName: accountType === AccountType.CASH ? 'Shop Cash Drawer' : 'Example Bank',
    }),
    requireOpenCashDesk: vi.fn().mockRejectedValue(new Error('Confirmed cash reached cash-desk validation')),
  };
  const idempotency = { key: vi.fn().mockResolvedValue('test-idempotency-key') };
  const service = new CustomersService(
    prisma as never,
    null as never,
    validation as never,
    idempotency as never,
    null as never,
  );
  const create = (overrides: Partial<CreateCustomerLedgerEntryDto> = {}) =>
    service.createCardLedgerEntry(
      'customer-1',
      {
        direction: 'PAY_IN',
        amount: 38400,
        financialAccountId: 'account-1',
        ...overrides,
      },
      'owner-1',
      RoleName.OWNER,
    );
  return { create, tx, validation };
}

describe('customer Card Ledger physical cash safeguards', () => {
  it('rejects a Pay In against the cash drawer without explicit physical-cash confirmation', async () => {
    const { create, tx, validation } = setup(AccountType.CASH);
    await expect(create()).rejects.toThrow('This would change the physical cash drawer');
    expect(validation.requireOpenCashDesk).not.toHaveBeenCalled();
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it('rejects Pay Out from a cash drawer to a customer bank or UPI, even with confirmation', async () => {
    const { create, tx } = setup(AccountType.CASH);
    await expect(create({
      direction: 'PAY_OUT',
      physicalCashConfirmed: true,
      payoutDestinationType: 'BANK',
      payoutDestinationId: 'customer-bank-1',
    })).rejects.toThrow('Cash drawer Pay Out requires cash handed to customer');
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it.each([AccountType.BANK, AccountType.PROVIDER_WALLET])(
    'rejects cash handed to customer from a non-cash source (%s)',
    async (accountType) => {
      const { create, tx, validation } = setup(accountType);
      await expect(create({
        direction: 'PAY_OUT',
        payoutDestinationType: 'CASH',
      })).rejects.toThrow('Cash handed to customer requires a physical cash drawer');
      expect(validation.requireOpenCashDesk).not.toHaveBeenCalled();
      expect(tx.transaction.create).not.toHaveBeenCalled();
    },
  );

  it('allows a confirmed real cash movement to reach the normal cash-session checks', async () => {
    const { create, validation } = setup(AccountType.CASH);
    await expect(create({ physicalCashConfirmed: true })).rejects.toThrow(
      'Confirmed cash reached cash-desk validation',
    );
    expect(validation.requireOpenCashDesk).toHaveBeenCalledTimes(1);
  });

  it('does not require physical cash confirmation for a bank Pay In', async () => {
    const { create, validation } = setup(AccountType.BANK);
    await expect(create()).rejects.not.toThrow('This would change the physical cash drawer');
    expect(validation.requireOpenCashDesk).not.toHaveBeenCalled();
  });
});
