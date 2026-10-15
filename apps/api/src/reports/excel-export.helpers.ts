import { BadRequestException } from '@nestjs/common';
import type { AccountNature, EntryType } from '@prisma/client';

export type ExportScope = 'all' | 'cash' | 'card' | 'accounts' | 'income';

export function exportPeriod(from: string, to: string, scope: string) {
  const valid = /^\d{4}-\d{2}-\d{2}$/;
  if (!valid.test(from) || !valid.test(to)) {
    throw new BadRequestException('Choose valid From and To dates (YYYY-MM-DD).');
  }
  const parse = (value: string) => {
    const date = new Date(value + 'T00:00:00.000Z');
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException('Invalid calendar date.');
    }
    return date;
  };
  const first = parse(from);
  const last = parse(to);
  if (first > last) throw new BadRequestException('From date must be before or equal to To date.');
  if (!['all', 'cash', 'card', 'accounts', 'income'].includes(scope)) {
    throw new BadRequestException('Unknown export category.');
  }
  const nextDate = new Date(last.getTime() + 86_400_000).toISOString().slice(0, 10);
  return {
    from, to, scope: scope as ExportScope,
    // Transaction timestamps are stored as instants; reports use India business days.
    start: new Date(from + 'T00:00:00+05:30'),
    end: new Date(nextDate + 'T00:00:00+05:30'),
    // @db.Date fields are calendar dates, not instants.
    dayStart: first,
    dayEnd: new Date(last.getTime() + 86_400_000),
  };
}

// Excel treats leading formula operators as executable when worksheets are moved
// between spreadsheet tools. Always force operator-prefixed user text to literal.
export function excelText(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'string' ? value : String(value);
  return /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? "'" + text : text;
}

export function asNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export function signedAccountMovement(
  nature: AccountNature,
  type: EntryType,
  amount: number,
): number {
  return nature === 'ASSET'
    ? type === 'DEBIT' ? amount : -amount
    : type === 'CREDIT' ? amount : -amount;
}

export function sheetDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  // Excel dates display in local business time without depending on the VPS timezone.
  return new Date(date.getTime() + 330 * 60_000);
}
