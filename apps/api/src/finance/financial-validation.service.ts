import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AccountNature,
  AccountType,
  EntryType,
  Prisma,
  UsageType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

type Db = Prisma.TransactionClient | PrismaService;

type AccountOptions = {
  types?: AccountType[];
  nature?: AccountNature;
  label?: string;
};

@Injectable()
export class FinancialValidationService {
  constructor(private readonly prisma: PrismaService) {}

  async activeCustomer(db: Db, customerId: string) {
    const customer = await db.customer.findUnique({ where: { id: customerId } });
    if (!customer?.isActive) {
      throw new NotFoundException('Active customer not found');
    }
    return customer;
  }

  async account(db: Db, accountId: string, options: AccountOptions = {}) {
    const account = await db.financialAccount.findUnique({
      where: { id: accountId },
      include: { ledgerAccount: true },
    });
    const label = options.label ?? 'Financial account';
    if (!account?.ledgerAccount || !account.isActive) {
      throw new NotFoundException(label + ' is not active or has no ledger');
    }
    if (options.types?.length && !options.types.includes(account.accountType)) {
      throw new BadRequestException(
        label + ' must be one of: ' + options.types.join(', '),
      );
    }
    if (options.nature && account.accountNature !== options.nature) {
      throw new BadRequestException(label + ' has an invalid account nature');
    }
    return account;
  }

  async lockAccount(tx: Prisma.TransactionClient, accountId: string) {
    await tx.$queryRawUnsafe(
      'SELECT "id" FROM "FinancialAccount" WHERE "id" = $1 FOR UPDATE',
      accountId,
    );
  }

  liquidAsset(db: Db, accountId: string, label = 'Account') {
    return this.account(db, accountId, {
      label,
      nature: AccountNature.ASSET,
      types: [
        AccountType.CASH,
        AccountType.BANK,
        AccountType.UPI,
        AccountType.PROVIDER_WALLET,
      ],
    });
  }

  transferSource(db: Db, accountId: string) {
    return this.account(db, accountId, {
      label: 'Transfer source account',
      nature: AccountNature.ASSET,
      types: [
        AccountType.BANK,
        AccountType.UPI,
        AccountType.PROVIDER_WALLET,
      ],
    });
  }

  customerReceiptAccount(db: Db, accountId: string) {
    return this.account(db, accountId, {
      label: 'Customer payment receiving account',
      nature: AccountNature.ASSET,
      types: [AccountType.CASH, AccountType.BANK, AccountType.UPI],
    });
  }

  transferFundingAccount(db: Db, accountId: string) {
    return this.account(db, accountId, {
      label: 'Transfer funding account',
      types: [
        AccountType.BANK,
        AccountType.UPI,
        AccountType.PROVIDER_WALLET,
        AccountType.OWNER_CREDIT_CARD,
      ],
    });
  }

  async providerSettlementDestination(
    db: Db,
    accountId: string,
    providerId?: string | null,
  ) {
    const account = await this.account(db, accountId, {
      label: 'Provider settlement destination',
      nature: AccountNature.ASSET,
      types: [
        AccountType.BANK,
        AccountType.UPI,
        AccountType.PROVIDER_WALLET,
      ],
    });
    if (
      providerId &&
      account.accountType === AccountType.PROVIDER_WALLET &&
      account.providerId !== providerId
    ) {
      throw new BadRequestException(
        'Provider wallet must belong to the selected provider',
      );
    }
    return account;
  }

  cashAccount(db: Db, accountId: string, label = 'Cash account') {
    return this.account(db, accountId, {
      label,
      nature: AccountNature.ASSET,
      types: [AccountType.CASH],
    });
  }

  private indiaBusinessDate() {
    const offset = 330 * 60 * 1000;
    const local = new Date(Date.now() + offset);
    return new Date(
      Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate(),
      ),
    );
  }

  async requireOpenCashDesk(
    db: Db,
    cashAccountId: string,
    label = 'Cash account',
  ) {
    const [session, account] = await Promise.all([
      db.cashSession.findFirst({
        where: {
          cashAccountId,
          businessDate: this.indiaBusinessDate(),
          status: 'OPEN',
        },
        select: { id: true },
      }),
      db.financialAccount.findUnique({
        where: { id: cashAccountId },
        select: { accountName: true },
      }),
    ]);
    if (!session) {
      throw new BadRequestException(
        label +
          ' needs an open cash session for ' +
          (account?.accountName ?? 'this cash drawer') +
          '. Open it from Cash first.',
      );
    }
    return session;
  }

  async requireOpenCashDeskForLedgerEntries(
    db: Db,
    entries: Array<{ ledgerAccountId: string }>,
    label = 'Cash adjustment',
  ) {
    const ledgerIds = [...new Set(entries.map((entry) => entry.ledgerAccountId))];
    if (!ledgerIds.length) return;
    const cashAccounts = await db.financialAccount.findMany({
      where: {
        accountType: AccountType.CASH,
        ledgerAccount: { id: { in: ledgerIds } },
      },
      select: { id: true },
    });
    for (const account of cashAccounts) {
      await this.requireOpenCashDesk(db, account.id, label);
    }
  }

  bankAccount(db: Db, accountId: string, label = 'Bank account') {
    return this.account(db, accountId, {
      label,
      nature: AccountNature.ASSET,
      types: [AccountType.BANK],
    });
  }

  ownerCreditCard(db: Db, accountId: string) {
    return this.account(db, accountId, {
      label: 'Owner credit card',
      nature: AccountNature.LIABILITY,
      types: [AccountType.OWNER_CREDIT_CARD],
    });
  }

  async customerCard(db: Db, customerId: string, cardId: string) {
    const card = await db.customerCard.findUnique({ where: { id: cardId } });
    if (!card?.isActive || card.customerId !== customerId) {
      throw new BadRequestException(
        'Selected active card does not belong to the customer',
      );
    }
    return card;
  }

  async providerGateway(
    db: Db,
    providerId?: string,
    gatewayId?: string,
    required = false,
  ) {
    if (required && (!providerId || !gatewayId)) {
      throw new BadRequestException('Provider and gateway are required');
    }
    if (!providerId && !gatewayId) return { provider: null, gateway: null };
    if (!providerId) {
      throw new BadRequestException('Provider is required when gateway is selected');
    }
    const provider = await db.provider.findUnique({ where: { id: providerId } });
    if (!provider?.isActive) {
      throw new BadRequestException('Selected provider is inactive or missing');
    }
    if (!gatewayId) return { provider, gateway: null };
    const gateway = await db.providerGateway.findUnique({ where: { id: gatewayId } });
    if (!gateway?.isActive || gateway.providerId !== providerId) {
      throw new BadRequestException(
        'Selected active gateway does not belong to the provider',
      );
    }
    return { provider, gateway };
  }

  async paymentTerm(db: Db, paymentTermId: string) {
    const term = await db.paymentTerm.findUnique({ where: { id: paymentTermId } });
    if (!term?.isActive) {
      throw new BadRequestException('Selected payment term is inactive or missing');
    }
    return term;
  }

  async expenseCategory(
    db: Db,
    categoryId: string,
    expenseType: UsageType,
  ) {
    const category = await db.expenseCategory.findUnique({
      where: { id: categoryId },
    });
    if (
      !category?.isActive ||
      (category.expenseUsage !== UsageType.MIXED &&
        category.expenseUsage !== expenseType)
    ) {
      throw new BadRequestException(
        'Selected expense category is inactive or incompatible with expense type',
      );
    }
    return category;
  }

  async balance(
    db: Db,
    account: {
      openingBalance: Prisma.Decimal;
      accountNature: AccountNature;
      ledgerAccount: { id: string } | null;
    },
  ) {
    if (!account.ledgerAccount) {
      throw new NotFoundException('Account ledger not found');
    }
    const rows = await db.ledgerEntry.groupBy({
      by: ['entryType'],
      where: {
        ledgerAccountId: account.ledgerAccount.id,
        journal: { status: 'POSTED' },
      },
      _sum: { amount: true },
    });
    let debit = 0;
    let credit = 0;
    for (const row of rows) {
      if (row.entryType === 'DEBIT') debit += Number(row._sum.amount ?? 0);
      else credit += Number(row._sum.amount ?? 0);
    }
    const opening = Number(account.openingBalance);
    return account.accountNature === AccountNature.ASSET
      ? opening + debit - credit
      : opening + credit - debit;
  }

  async ensureSufficientFunds(
    db: Db,
    account: {
      openingBalance: Prisma.Decimal;
      accountNature: AccountNature;
      ledgerAccount: { id: string } | null;
      accountName?: string;
    },
    requiredAmount: number,
  ) {
    if (requiredAmount < 0) {
      throw new BadRequestException('Required amount cannot be negative');
    }
    if (account.accountNature !== AccountNature.ASSET) {
      throw new BadRequestException('Source account must be an asset account');
    }
    const current = await this.balance(db, account);
    if (current + 0.001 < requiredAmount) {
      throw new BadRequestException(
        (account.accountName ?? 'Account') +
          ' has insufficient funds. Available: ' +
          current.toFixed(2),
      );
    }
    return current;
  }

  async ensureCreditCapacity(
    db: Db,
    account: {
      openingBalance: Prisma.Decimal;
      accountNature: AccountNature;
      ledgerAccount: { id: string } | null;
      creditLimit: Prisma.Decimal | null;
      accountName?: string;
    },
    additionalAmount: number,
  ) {
    const outstanding = await this.balance(db, account);
    if (
      account.creditLimit &&
      outstanding + additionalAmount > Number(account.creditLimit) + 0.001
    ) {
      throw new BadRequestException(
        (account.accountName ?? 'Credit card') +
          ' would exceed its configured credit limit',
      );
    }
    return outstanding;
  }

  async ensureReversalCapacity(
    tx: Prisma.TransactionClient,
    entries: Array<{
      ledgerAccountId: string;
      entryType: EntryType;
      amount: Prisma.Decimal | number;
    }>,
  ) {
    const ledgerIds = [...new Set(entries.map((entry) => entry.ledgerAccountId))];
    const accounts = await tx.financialAccount.findMany({
      where: { ledgerAccount: { id: { in: ledgerIds } } },
      include: { ledgerAccount: true },
    });

    const reductions = new Map<string, number>();
    for (const account of accounts) {
      if (!account.ledgerAccount) continue;
      const reduction = entries
        .filter((entry) => entry.ledgerAccountId === account.ledgerAccount!.id)
        .filter((entry) =>
          account.accountNature === AccountNature.ASSET
            ? entry.entryType === EntryType.DEBIT
            : entry.entryType === EntryType.CREDIT,
        )
        .reduce((sum, entry) => sum + Number(entry.amount), 0);
      if (reduction > 0) reductions.set(account.id, reduction);
    }

    for (const accountId of [...reductions.keys()].sort()) {
      await this.lockAccount(tx, accountId);
    }
    for (const account of accounts) {
      const required = reductions.get(account.id) ?? 0;
      if (required <= 0) continue;
      const current = await this.balance(tx, account);
      if (current + 0.001 < required) {
        throw new BadRequestException(
          'Cannot reverse because ' +
            account.accountName +
            ' no longer has enough available balance/outstanding',
        );
      }
    }
  }

  async activeAccountBalance(accountId: string) {
    const account = await this.account(this.prisma, accountId);
    return this.balance(this.prisma, account);
  }
}
