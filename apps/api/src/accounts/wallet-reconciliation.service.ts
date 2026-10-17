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

  private async wallet(db: Prisma.TransactionClient | PrismaService, id: string) {
    const account = await db.financialAccount.findUnique({
      where: { id }, include: { ledgerAccount: true },
    });
    if (!account?.ledgerAccount || !account.isActive ||
        account.accountType !== AccountType.PROVIDER_WALLET ||
        account.accountNature !== AccountNature.ASSET)
      throw new NotFoundException('Active provider wallet not found');
    return account;
  }

  private async balance(db: Prisma.TransactionClient | PrismaService, ledgerAccountId: string, openingBalance: Prisma.Decimal) {
    const rows = await db.ledgerEntry.groupBy({
      by: ['entryType'],
      where: { ledgerAccountId, journal: { status: 'POSTED' } },
      _sum: { amount: true },
    });
    let current = openingBalance;
    for (const row of rows) {
      const value = row._sum.amount ?? new Prisma.Decimal(0);
      current = row.entryType === EntryType.DEBIT ? current.add(value) : current.sub(value);
    }
    return current;
  }

  async preview(id: string) {
    const account = await this.wallet(this.prisma, id);
    const current = await this.balance(
      this.prisma, account.ledgerAccount!.id, account.openingBalance,
    );
    const [rules, last] = await Promise.all([
      this.prisma.providerPayoutChargeRule.count({
        where: { providerId: account.providerId!, effectiveTo: null },
      }),
      this.prisma.auditLog.findFirst({
        where: { entityType: 'FINANCIAL_ACCOUNT', entityId: id, action: 'RECONCILE_PROVIDER_WALLET' },
        orderBy: { createdAt: 'desc' }, select: { createdAt: true, newValues: true },
      }),
    ]);
    return {
      accountId: id, accountName: account.accountName,
      systemBalance: Number(current.toFixed(2)),
      payoutChargeRulesConfigured: rules > 0,
      lastReconciledAt: last?.createdAt ?? null,
    };
  }

  async reconcile(id: string, dto: ReconcileWalletDto, actorId: string, idempotencyKey?: string) {
    if (dto.confirmed !== true)
      throw new BadRequestException('Confirm the provider balance against its statement before posting');
    if (!safeMoney(dto.expectedBalance) || !safeMoney(dto.providerBalance) || !safeMoney(dto.confirmedCharges))
      throw new BadRequestException('Enter valid non-negative amounts with two decimal places');
    const reference = dto.statementReference?.trim();
    const reason = dto.reason?.trim();
    if (!reference || reference.length < 4 || reference.length > 200 ||
        !reason || reason.length < 10 || reason.length > 500)
      throw new BadRequestException('Provide the provider statement reference and an explanation');
    if (idempotencyKey && (idempotencyKey.length > 180 || !/^[a-zA-Z0-9._:-]+$/.test(idempotencyKey)))
      throw new BadRequestException('Invalid idempotency key');
    const expectedCents = cents(dto.expectedBalance);
    const targetCents = cents(dto.providerBalance);
    const feeCents = cents(dto.confirmedCharges);
    const differenceCents = targetCents - expectedCents;
    if (differenceCents === 0)
      throw new BadRequestException('Wallet already matches the stated provider balance');
    if (feeCents > Math.max(0, -differenceCents))
      throw new BadRequestException('Confirmed charges cannot exceed the missing wallet balance');
    const remainderCents = Math.abs(differenceCents) - feeCents;
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      // Prevent concurrent manual adjustments/postings and avoid stale-balance write-offs.
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "FinancialAccount" WHERE "id" = $1 FOR UPDATE', id,
      );
      const account = await this.wallet(tx, id);
      const actual = await this.balance(tx, account.ledgerAccount!.id, account.openingBalance);
      if (cents(Number(actual)) !== expectedCents)
        throw new ConflictException('Wallet balance changed. Refresh the reconciliation and review the difference again');
      const chargeLedger = feeCents > 0
        ? await tx.ledgerAccount.findUnique({ where: { ledgerCode: 'SYS-PROVIDER-CHARGE' } }) : null;
      const adjustmentLedger = remainderCents > 0
        ? await tx.ledgerAccount.findUnique({ where: { ledgerCode: 'SYS-ACCOUNT-ADJUSTMENT' } }) : null;
      if (feeCents > 0 && !chargeLedger || remainderCents > 0 && !adjustmentLedger)
        throw new BadRequestException('System fee or reconciliation adjustment ledger is not configured');

      const movement = amount(Math.abs(differenceCents));
      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: 'WREC-' + randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase(),
          transactionType: TransactionType.ACCOUNT_ENTRY,
          transactionAt: now,
          grossAmount: movement, netAmount: movement,
          status: TransactionStatus.COMPLETED, createdById: actorId,
          ...(idempotencyKey ? { idempotencyKey: 'WREC:' + idempotencyKey } : {}),
          referenceNumber: reference,
          notes: 'Provider wallet reconciliation. ' + reason,
        },
      });
      await tx.accountEntryDetail.create({
        data: {
          transactionId: transaction.id, accountId: id,
          direction: differenceCents > 0 ? 'IN' : 'OUT',
          entryKind: 'WALLET_RECONCILIATION',
          amount: movement, entryLabel: 'Provider statement reconciliation',
        },
      });
      const entries: JournalEntry[] = differenceCents < 0
        ? [{ ledgerAccountId: account.ledgerAccount!.id, entryType: EntryType.CREDIT,
            amount: Number(movement), description: 'Provider wallet statement shortfall' }]
        : [{ ledgerAccountId: account.ledgerAccount!.id, entryType: EntryType.DEBIT,
            amount: Number(movement), description: 'Provider wallet statement excess' }];
      if (feeCents > 0) {
        entries.push({ ledgerAccountId: chargeLedger!.id, entryType: EntryType.DEBIT,
          amount: Number(amount(feeCents)), description: 'Verified unrecorded provider fees' });
        await tx.transactionCharge.create({
          data: { transactionId: transaction.id, chargeType: 'PAYOUT_RECONCILIATION',
            sourceAccountId: account.id, providerId: account.providerId,
            calculationType: 'FIXED', amount: amount(feeCents),
            notes: 'Verified provider fee from statement: ' + reference },
        });
      }
      if (remainderCents > 0) entries.push({
        ledgerAccountId: adjustmentLedger!.id,
        entryType: differenceCents > 0 ? EntryType.CREDIT : EntryType.DEBIT,
        amount: Number(amount(remainderCents)),
        description: 'Unexplained statement difference: ' + reason,
      });
      await this.ledger.post(
        tx, transaction.id, actorId, 'Provider wallet balance reconciliation',
        entries, now,
      );
      await tx.auditLog.create({ data: {
        userId: actorId, entityType: 'FINANCIAL_ACCOUNT',
        entityId: id, action: 'RECONCILE_PROVIDER_WALLET',
        oldValues: { balance: actual.toFixed(2) },
        newValues: {
          balance: amount(targetCents).toFixed(2),
          movement: amount(Math.abs(differenceCents)).toFixed(2),
          confirmedProviderCharges: amount(feeCents).toFixed(2),
          otherAdjustment: amount(remainderCents).toFixed(2),
          statementReference: reference, transactionId: transaction.id,
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
