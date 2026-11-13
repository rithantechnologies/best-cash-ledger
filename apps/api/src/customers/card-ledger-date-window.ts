import { BadRequestException } from '@nestjs/common';

/** ISO dates denote Indian business days (00:00 IST to next 00:00 IST). */
export function cardLedgerDateWindow(from?: string, to?: string) {
  if (!from && !to) return null; // backwards-compatible all-time API
  const isValid = (value: string | undefined) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (!isValid(from) || !isValid(to) || from! > to!) {
    throw new BadRequestException('Provide a valid From and To date (YYYY-MM-DD), with From on or before To.');
  }
  const start = new Date(from! + 'T00:00:00+05:30');
  const end = new Date(new Date(to! + 'T00:00:00+05:30').getTime() + 86400000);
  return { from: from!, to: to!, start, end };
}
