import { Injectable } from '@nestjs/common';
import { EntryType, JournalStatus, Prisma } from '@prisma/client';

type JournalEntry = {
  ledgerAccountId: string;
  entryType: EntryType;
  amount: number;
  customerId?: string;
  payableId?: string;
  receivableId?: string;
  description?: string;
};

@Injectable()
export class LedgerService {
  async post(
    tx: Prisma.TransactionClient,
    transactionId: string,
    createdById: string,
    description: string,
    entries: JournalEntry[],
  ) {
    const debit = entries
      .filter((entry) => entry.entryType === EntryType.DEBIT)
      .reduce((sum, entry) => sum + entry.amount, 0);
    const credit = entries
      .filter((entry) => entry.entryType === EntryType.CREDIT)
      .reduce((sum, entry) => sum + entry.amount, 0);

    if (Math.abs(debit - credit) > 0.001) {
      throw new Error('Ledger journal is not balanced');
    }
    return tx.ledgerJournal.create({
      data: {
        transactionId,
        journalNumber: 'JRN-' + Date.now().toString(36).toUpperCase(),
        postingDate: new Date(),
        description,
        status: JournalStatus.POSTED,
        createdById,
        entries: {
          create: entries.map((entry) => ({
            ...entry,
            amount: new Prisma.Decimal(entry.amount),
          })),
        },
      },
      include: { entries: true },
    });
  }
}
