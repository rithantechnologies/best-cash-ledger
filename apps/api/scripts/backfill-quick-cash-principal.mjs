import { PrismaClient, EntryType, TransactionStatus } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

const money = (value) => Math.round(Number(value) * 100) / 100;
const eq = (a, b) => Math.abs(money(a) - money(b)) < 0.001;

async function main() {
  const actor = await prisma.user.findUnique({
    where: { email: process.env.OWNER_EMAIL },
    select: { id: true, email: true },
  });
  if (!actor) throw new Error('OWNER_EMAIL user not found; aborting backfill');

  const details = await prisma.quickCashTransferDetail.findMany({
    where: {
      direction: 'IN',
      commissionMode: 'CASH',
      transaction: {
        status: { in: [TransactionStatus.PENDING, TransactionStatus.COMPLETED] },
      },
    },
    include: {
      transaction: {
        include: {
          journal: {
            include: {
              entries: {
                include: { ledgerAccount: true },
              },
            },
          },
        },
      },
      cashAccount: {
        include: { ledgerAccount: true },
      },
      sourceAccount: {
        include: { ledgerAccount: true },
      },
    },
    orderBy: { transaction: { transactionAt: 'asc' } },
  });

  const candidates = details.filter((detail) => {
    const principal = Number(detail.amount);
    const commission = Number(detail.commissionAmount ?? 0);
    const net = Number(detail.transaction.netAmount ?? detail.transaction.grossAmount);
    const gross = Number(detail.transaction.grossAmount);
    return commission > 0 && eq(gross, principal) && eq(net, principal - commission);
  });

  console.log(JSON.stringify({
    mode: apply ? 'APPLY' : 'DRY_RUN',
    candidateCount: candidates.length,
    candidates: candidates.map((d) => ({
      transactionNumber: d.transaction.transactionNumber,
      status: d.transaction.status,
      principal: Number(d.amount),
      commission: Number(d.commissionAmount),
      oldNet: Number(d.transaction.netAmount ?? d.transaction.grossAmount),
      correctedNet: Number(d.amount),
    })),
  }, null, 2));

  if (!apply || candidates.length === 0) return;

  for (const detail of candidates) {
    const tx = detail.transaction;
    const principal = money(detail.amount);
    const commission = money(detail.commissionAmount);
    const oldNet = money(tx.netAmount ?? tx.grossAmount);
    const correctedCash = money(principal + commission);

    if (!tx.journal) throw new Error(`${tx.transactionNumber}: original journal missing`);

    const cashDebit = tx.journal.entries.find((e) =>
      e.entryType === EntryType.DEBIT &&
      e.ledgerAccountId === detail.cashAccount.ledgerAccount.id &&
      eq(e.amount, principal)
    );
    const payableCredit = tx.journal.entries.find((e) =>
      e.entryType === EntryType.CREDIT &&
      e.ledgerAccount.ledgerCode === 'SYS-CUST-PAYABLE' &&
      eq(e.amount, oldNet)
    );
    const commissionCredit = tx.journal.entries.find((e) =>
      e.entryType === EntryType.CREDIT &&
      e.ledgerAccount.ledgerCode === 'SYS-COMMISSION' &&
      eq(e.amount, commission)
    );

    if (!cashDebit || !payableCredit || !commissionCredit) {
      throw new Error(`${tx.transactionNumber}: journal shape does not match expected legacy quick-cash pattern`);
    }

    let completion = null;
    if (tx.status === TransactionStatus.COMPLETED) {
      completion = await prisma.transaction.findFirst({
        where: {
          notes: `Completion for ${tx.transactionNumber}`,
          transactionType: 'CASH_TRANSFER',
        },
        include: {
          journal: {
            include: {
              entries: { include: { ledgerAccount: true } },
            },
          },
        },
      });
      if (!completion?.journal) {
        throw new Error(`${tx.transactionNumber}: completion transaction/journal missing`);
      }

      const completionPayable = completion.journal.entries.find((e) =>
        e.entryType === EntryType.DEBIT &&
        e.ledgerAccount.ledgerCode === 'SYS-CUST-PAYABLE' &&
        eq(e.amount, oldNet)
      );
      const completionSource = completion.journal.entries.find((e) =>
        e.entryType === EntryType.CREDIT &&
        eq(e.amount, oldNet)
      );

      if (!completionPayable || !completionSource) {
        throw new Error(`${tx.transactionNumber}: completion journal shape does not match expected legacy pattern`);
      }
    }

    await prisma.$transaction(async (db) => {
      await db.quickCashTransferDetail.update({
        where: { id: detail.id },
        data: { commissionCashAmount: commission },
      });

      await db.transaction.update({
        where: { id: tx.id },
        data: {
          grossAmount: principal,
          netAmount: principal,
        },
      });

      await db.ledgerEntry.update({
        where: { id: cashDebit.id },
        data: {
          amount: correctedCash,
          description: 'Quick cash received · principal + cash commission',
        },
      });
      await db.ledgerEntry.update({
        where: { id: payableCredit.id },
        data: { amount: principal },
      });

      if (completion) {
        const completionPayable = completion.journal.entries.find((e) =>
          e.entryType === EntryType.DEBIT &&
          e.ledgerAccount.ledgerCode === 'SYS-CUST-PAYABLE' &&
          eq(e.amount, oldNet)
        );
        const completionSource = completion.journal.entries.find((e) =>
          e.entryType === EntryType.CREDIT &&
          eq(e.amount, oldNet)
        );

        await db.transaction.update({
          where: { id: completion.id },
          data: {
            grossAmount: principal,
            netAmount: principal,
          },
        });
        await db.ledgerEntry.update({
          where: { id: completionPayable.id },
          data: { amount: principal },
        });
        await db.ledgerEntry.update({
          where: { id: completionSource.id },
          data: { amount: principal },
        });
      }

      await db.auditLog.create({
        data: {
          userId: actor.id,
          entityType: 'TRANSACTION',
          entityId: tx.id,
          action: 'QUICK_CASH_PRINCIPAL_BACKFILL',
          oldValues: {
            grossAmount: money(tx.grossAmount),
            netAmount: oldNet,
            commissionCashAmount: detail.commissionCashAmount === null ? null : money(detail.commissionCashAmount),
          },
          newValues: {
            grossAmount: principal,
            netAmount: principal,
            commissionCashAmount: commission,
            physicalCashReceived: correctedCash,
          },
          reason: 'Correct legacy Quick Cash IN records so Amount is principal and cash commission is separate.',
        },
      });
    });

    console.log(`fixed ${tx.transactionNumber}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
