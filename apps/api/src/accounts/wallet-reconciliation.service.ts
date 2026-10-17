import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountNature, AccountType, EntryType, Prisma, TransactionStatus, TransactionType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { LedgerService, type JournalEntry } from '../ledger/ledger.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReconcileWalletDto } from './dto/reconcile-wallet.dto.js';

const cents = (amount: number) => Math.round(Number(amount) * 100);
const amount = (value: number) => new Prisma.Decimal(value).div(100);
const safeMoney = (value: number) =>
  Number.isFinite(value) && value >= 0 && value <= 999999999999.99 &&
  Math.abs(cents(value) / 100 - value) < 0.00001;

@Injectable()
export class WalletReconciliationService {
  constructor(private readonly prisma: PrismaService, private readonly ledger: LedgerService) {}

  private async account(db: Prisma.TransactionClient | PrismaService, id: string) {
    const account = await db.financialAccount.findUnique({
      where: { id }, include: { ledgerAccount: true },
    });
    if (!account?.ledgerAccount || !account.isActive ||
        ![AccountType.PROVIDER_WALLET, AccountType.BANK, AccountType.UPI,
          AccountType.CASH, AccountType.OWNER_CREDIT_CARD].includes(account.accountType))
      throw new NotFoundException('Active financial account not found');
    const expectedNature = account.accountType === AccountType.OWNER_CREDIT_CARD
      ? AccountNature.LIABILITY : AccountNature.ASSET;
    if (account.accountNature !== expectedNature)
      throw new BadRequestException('Account has an invalid debit/credit nature');
    return account;
  }

  private async balance(
    db: Prisma.TransactionClient | PrismaService,
    ledgerAccountId: string, openingBalance: Prisma.Decimal, nature: AccountNature,
  ) {
    const rows = await db.ledgerEntry.groupBy({
      by: ['entryType'],
      where: { ledgerAccountId, journal: { status: 'POSTED' } },
      _sum: { amount: true },
    });
    let current = openingBalance;
    for (const row of rows) {
      const value = row._sum.amount ?? new Prisma.Decimal(0);
      const increases = nature === AccountNature.ASSET
        ? row.entryType === EntryType.DEBIT
        : row.entryType === EntryType.CREDIT;
      current = increases ? current.add(value) : current.sub(value);
    }
    return current;
  }

  async preview(id: string) {
    const account = await this.account(this.prisma, id);
    const current = await this.balance(
      this.prisma, account.ledgerAccount!.id, account.openingBalance, account.accountNature,
    );
    const [rules, last, activeCashSessions] = await Promise.all([
      account.accountType === AccountType.PROVIDER_WALLET && account.providerId
        ? this.prisma.providerPayoutChargeRule.count({
            where: { providerId: account.providerId, effectiveTo: null },
          })
        : Promise.resolve(null),
      this.prisma.auditLog.findFirst({
        where: { entityType: 'FINANCIAL_ACCOUNT', entityId: id,
          action: { in: ['RECONCILE_PROVIDER_WALLET', 'RECONCILE_ACCOUNT'] } },
        orderBy: { createdAt: 'desc' }, select: { createdAt: true, newValues: true },
      }),
      account.accountType === AccountType.CASH
        ? this.prisma.cashSession.count({ where: { cashAccountId: id, status: 'OPEN' } })
        : Promise.resolve(0),
    ]);
    return {
      accountId: id, accountName: account.accountName, accountType: account.accountType,
      accountNature: account.accountNature,
      systemBalance: Number(current.toFixed(2)),
      payoutChargeRulesConfigured: rules === null ? null : rules > 0,
      hasOpenCashSession: activeCashSessions > 0,
      lastReconciledAt: last?.createdAt ?? null,
    };
  }

  async reconcile(id: string, dto: ReconcileWalletDto, actorId: string, idempotencyKey?: string) {
    if (dto.confirmed !== true)
      throw new BadRequestException('Confirm the actual balance against supporting evidence before posting');
    if (!safeMoney(dto.expectedBalance) || !safeMoney(dto.providerBalance) || !safeMoney(dto.confirmedCharges))
      throw new BadRequestException('Enter valid non-negative amounts with two decimal places');
    const reference = dto.statementReference?.trim();
    const reason = dto.reason?.trim();
    if (!reference || reference.length < 4 || reference.length > 200 ||
        !reason || reason.length < 10 || reason.length > 500)
      throw new BadRequestException('Provide the statement or cash-count reference and an explanation');
    if (idempotencyKey && (idempotencyKey.length > 180 || !/^[a-zA-Z0-9._:-]+$/.test(idempotencyKey)))
      throw new BadRequestException('Invalid idempotency key');
    const expectedCents = cents(dto.expectedBalance);
    const targetCents = cents(dto.providerBalance);
    const feeCents = cents(dto.confirmedCharges);
    const differenceCents = targetCents - expectedCents;
    if (differenceCents === 0)
      throw new BadRequestException('Account already matches the verified external balance');
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      // Prevent concurrent manual adjustments/postings and avoid stale-balance write-offs.
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "FinancialAccount" WHERE "id" = $1 FOR UPDATE', id,
      );
      const account = await this.account(tx, id);
      // Cash movements must be attributed to a session. Only Owner-approved
      // adjustments outside an active session may be reconciled this way.
      if (account.accountType === AccountType.CASH) {
        const openSessions = await tx.cashSession.count({
          where: { cashAccountId: id, status: 'OPEN' },
        });
        if (openSessions > 0)
          throw new BadRequestException('Close the active cash session before Owner reconciliation');
      }
      const isAsset = account.accountNature === AccountNature.ASSET;
      const feeEligible = account.accountType !== AccountType.CASH;
      const isDebitCharge = isAsset ? differenceCents < 0 : differenceCents > 0;
      if (feeCents > 0 && (!feeEligible || !isDebitCharge || feeCents > Math.abs(differenceCents)))
        throw new BadRequestException('Confirmed charges must be supported and cannot exceed the account shortfall or added card liability');
      const remainderCents = Math.abs(differenceCents) - feeCents;
      const actual = await this.balance(
        tx, account.ledgerAccount!.id, account.openingBalance, account.accountNature,
      );
      if (cents(Number(actual)) !== expectedCents)
        throw new ConflictException('Account balance changed. Refresh the reconciliation and review the difference again');
      const chargeLedger = feeCents > 0
        ? await tx.ledgerAccount.findUnique({ where: { ledgerCode: 'SYS-PROVIDER-CHARGE' } }) : null;
      const adjustmentLedger = remainderCents > 0
        ? await tx.ledgerAccount.findUnique({ where: { ledgerCode: 'SYS-ACCOUNT-ADJUSTMENT' } }) : null;
      if (feeCents > 0 && !chargeLedger || remainderCents > 0 && !adjustmentLedger)
        throw new BadRequestException('System fee or reconciliation adjustment ledger is not configured');

      const movement = amount(Math.abs(differenceCents));
      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: 'AREC-' + randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase(),
          transactionType: TransactionType.ACCOUNT_ENTRY,
          transactionAt: now,
          grossAmount: movement, netAmount: movement,
          status: TransactionStatus.COMPLETED, createdById: actorId,
          ...(idempotencyKey ? { idempotencyKey: 'AREC:' + id + ':' + idempotencyKey } : {}),
          referenceNumber: reference,
          notes: 'Owner account reconciliation. ' + reason,
        },
      });
      await tx.accountEntryDetail.create({
        data: {
          transactionId: transaction.id, accountId: id,
          direction: differenceCents > 0 ? 'IN' : 'OUT',
          entryKind: account.accountType === AccountType.PROVIDER_WALLET
            ? 'WALLET_RECONCILIATION' : 'ACCOUNT_RECONCILIATION',
          amount: movement, entryLabel: 'Owner verified account reconciliation',
        },
      });
      // Assets increase on DEBIT; liabilities (credit-card outstanding)
      // increase on CREDIT. This reversal is essential for accurate balances.
      const balanceIncreases = differenceCents > 0;
      const accountEntryType = (isAsset === balanceIncreases)
        ? EntryType.DEBIT : EntryType.CREDIT;
      const entries: JournalEntry[] = [{
        ledgerAccountId: account.ledgerAccount!.id, entryType: accountEntryType,
        amount: Number(movement), description: 'Verified account statement adjustment',
      }];
      if (feeCents > 0) {
        entries.push({ ledgerAccountId: chargeLedger!.id, entryType: EntryType.DEBIT,
          amount: Number(amount(feeCents)), description: 'Verified unrecorded account/provider fees' });
        await tx.transactionCharge.create({
          data: { transactionId: transaction.id,
            chargeType: account.accountType === AccountType.PROVIDER_WALLET
              ? 'PAYOUT_RECONCILIATION' : 'ACCOUNT_RECONCILIATION_FEE',
            sourceAccountId: account.id, providerId: account.providerId,
            calculationType: 'FIXED', amount: amount(feeCents),
            notes: 'Verified unrecorded fee from evidence: ' + reference },
        });
      }
      if (remainderCents > 0) entries.push({
        ledgerAccountId: adjustmentLedger!.id,
        entryType: accountEntryType === EntryType.DEBIT ? EntryType.CREDIT : EntryType.DEBIT,
        amount: Number(amount(remainderCents)),
        description: 'Owner verified residual account difference: ' + reason,
      });
      await this.ledger.post(
        tx, transaction.id, actorId, 'Owner verified account reconciliation',
        entries, now,
      );
      await tx.auditLog.create({ data: {
        userId: actorId, entityType: 'FINANCIAL_ACCOUNT',
        entityId: id, action: account.accountType === AccountType.PROVIDER_WALLET
          ? 'RECONCILE_PROVIDER_WALLET' : 'RECONCILE_ACCOUNT',
        oldValues: { balance: actual.toFixed(2) },
        newValues: {
          balance: amount(targetCents).toFixed(2),
          movement: amount(Math.abs(differenceCents)).toFixed(2),
          confirmedProviderCharges: amount(feeCents).toFixed(2),
          otherAdjustment: amount(remainderCents).toFixed(2),
          statementReference: reference, transactionId: transaction.id,
          accountType: account.accountType, accountNature: account.accountNature,
        },
        reason,
      } });
      return {
        transactionId: transaction.id, transactionNumber: transaction.transactionNumber,
        before: Number(actual.toFixed(2)), after: Number(amount(targetCents)),
        charges: Number(amount(feeCents)), otherAdjustment: Number(amount(remainderCents)),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
