import { BadRequestException, ConflictException } from '@nestjs/common';
import { AccountNature, AccountType, EntryType, Prisma, RoleName } from '@prisma/client';
import { AccountsController } from './accounts.controller.js';
import { WalletReconciliationService } from './wallet-reconciliation.service.js';
import { LedgerService } from '../ledger/ledger.service.js';

function fixture(options: { type?: AccountType; postedDebit?: number; postedCredit?: number; accountActive?: boolean } = {}) {
  const account: any = {
    id: 'wallet-1', accountName: 'PaySwitch Wallet',
    accountType: options.type ?? AccountType.PROVIDER_WALLET,
    accountNature: AccountNature.ASSET, isActive: options.accountActive ?? true,
    openingBalance: new Prisma.Decimal(68009),
    providerId: 'provider-1', ledgerAccount: { id: 'ledger-wallet' },
  };
  const tx: any = {
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ id: 'wallet-1' }]),
    financialAccount: { findUnique: vi.fn().mockResolvedValue(account) },
    ledgerEntry: { groupBy: vi.fn().mockResolvedValue([
      { entryType: EntryType.DEBIT, _sum: { amount: new Prisma.Decimal(options.postedDebit ?? 98420) } },
      { entryType: EntryType.CREDIT, _sum: { amount: new Prisma.Decimal(options.postedCredit ?? 0) } },
    ]) },
    ledgerAccount: { findUnique: vi.fn(async ({ where }: any) =>
      ({ id: where.ledgerCode, ledgerCode: where.ledgerCode })) },
    transaction: { create: vi.fn(async ({data}: any) =>
      ({ id: 'reconciliation-1', transactionNumber: data.transactionNumber, ...data })) },
    accountEntryDetail: { create: vi.fn().mockResolvedValue({}) },
    transactionCharge: { create: vi.fn().mockResolvedValue({}) },
    ledgerJournal: { create: vi.fn(async ({data}: any) => {
      const items = data.entries.create;
      const debits = items.filter((x:any) => x.entryType === EntryType.DEBIT)
        .reduce((sum:number, x:any) => sum + Number(x.amount),0);
      const credits = items.filter((x:any) => x.entryType === EntryType.CREDIT)
        .reduce((sum:number, x:any) => sum + Number(x.amount),0);
      if (Math.abs(debits - credits) > .0001) throw new Error('Unbalanced ledger');
      return { id: 'jrn-1', ...data };
    }) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
  };
  const db: any = {
    $transaction: vi.fn((fn: any) => fn(tx)),
    financialAccount: tx.financialAccount, ledgerEntry: tx.ledgerEntry,
    providerPayoutChargeRule: { count: vi.fn().mockResolvedValue(0) },
    auditLog: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  return { service: new WalletReconciliationService(db, new LedgerService()), tx, db };
}
const inputs = (overrides: Record<string, any> = {}) => ({
  expectedBalance: 166429, providerBalance: 163906.60,
  confirmedCharges: 522.4, statementReference: 'PaySwitch statement 17-Oct',
  reason: 'Statement reconciled, charges verified against provider debits',
  confirmed: true, ...overrides,
});

describe('Provider wallet reconciliation', () => {
  it('is protected as OWNER-only for preview and posting', () => {
    expect(Reflect.getMetadata('roles', AccountsController.prototype.previewWalletReconciliation))
      .toEqual([RoleName.OWNER]);
    expect(Reflect.getMetadata('roles', AccountsController.prototype.reconcileWallet))
      .toEqual([RoleName.OWNER]);
  });

  it('gives all-time posted wallet balance, not a 30-day window', async () => {
    const {service, db} = fixture();
    const preview = await service.preview('wallet-1');
    expect(preview.systemBalance).toBe(166429);
    expect(preview.payoutChargeRulesConfigured).toBe(false);
    expect(db.ledgerEntry.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where:{ ledgerAccountId:'ledger-wallet', journal: { status:'POSTED' } },
    }));
  });

  it('posts one balanced debit plus fee-expense and reconciliation entries, not a silent opening edit', async () => {
    const {service, tx} = fixture();
    const result = await service.reconcile('wallet-1', inputs(), 'owner-1', 'once');
    expect(result.before).toBe(166429);
    expect(result.after).toBe(163906.6);
    expect(result.charges).toBe(522.4);
    expect(result.otherAdjustment).toBe(2000);
    expect(tx.financialAccount.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.ledgerJournal.create).toHaveBeenCalledTimes(1);
    const entries = tx.ledgerJournal.create.mock.calls[0][0].data.entries.create;
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ledgerAccountId:'ledger-wallet',entryType:EntryType.CREDIT,amount:new Prisma.Decimal(2522.4)}),
      expect.objectContaining({ledgerAccountId:'SYS-PROVIDER-CHARGE',entryType:EntryType.DEBIT,amount:new Prisma.Decimal(522.4)}),
      expect.objectContaining({ledgerAccountId:'SYS-ACCOUNT-ADJUSTMENT',entryType:EntryType.DEBIT,amount:new Prisma.Decimal(2000)}),
    ]));
    expect(tx.transactionCharge.create).toHaveBeenCalledWith({data:expect.objectContaining({
      chargeType:'PAYOUT_RECONCILIATION',amount:new Prisma.Decimal(522.4), sourceAccountId:'wallet-1',
    })});
    expect(tx.auditLog.create).toHaveBeenCalledWith({data:expect.objectContaining({
      entityType:'FINANCIAL_ACCOUNT',entityId:'wallet-1',action:'RECONCILE_PROVIDER_WALLET',
      oldValues:{balance:'166429.00'},newValues:expect.objectContaining({
        balance:'163906.60',confirmedProviderCharges:'522.40',otherAdjustment:'2000.00',
      })
    })});
  });

  it('rejects stale client balances under lock before creating any transactions', async () => {
    const {service,tx} = fixture({postedDebit:98500});
    await expect(service.reconcile('wallet-1', inputs(), 'owner-1')).rejects.toThrow(ConflictException);
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it.each([
    inputs({confirmed:false}),
    inputs({confirmedCharges:3000}),
    inputs({confirmedCharges:-5}),
    inputs({providerBalance:166429}),
    inputs({reason:'short'}),
    inputs({statementReference:''}),
  ])('refuses unverified, impossible or unexplained adjustments', async (request) => {
    const {service,tx} = fixture();
    await expect(service.reconcile('wallet-1', request, 'owner-1')).rejects.toThrow(BadRequestException);
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it('handles genuine provider excess as a balanced credit to other adjustments', async () => {
    const {service,tx} = fixture();
    const result=await service.reconcile('wallet-1',inputs({providerBalance:166500,confirmedCharges:0}),'owner-1');
    expect(result.otherAdjustment).toBe(71);
    const entries=tx.ledgerJournal.create.mock.calls[0][0].data.entries.create;
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ledgerAccountId:'ledger-wallet',entryType:EntryType.DEBIT,amount:new Prisma.Decimal(71)}),
      expect.objectContaining({ledgerAccountId:'SYS-ACCOUNT-ADJUSTMENT',entryType:EntryType.CREDIT,amount:new Prisma.Decimal(71)}),
    ]));
    expect(tx.transactionCharge.create).not.toHaveBeenCalled();
  });

  it('rejects non-wallet accounts without posting', async () => {
    const {service, tx}=fixture({type:AccountType.CASH});
    await expect(service.reconcile('wallet-1',inputs(),'owner-1')).rejects.toThrow();
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });
});
