import { BadRequestException } from '@nestjs/common';

// Reports use completedAt, not original creation/business dates.
// India Standard Time never observes DST.
export function completedReportBounds(from: string, to: string) {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Use YYYY-MM-DD dates');
    const date = new Date(value + 'T00:00:00+05:30');
    if (!Number.isFinite(date.getTime()) ||
      new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 10) !== value)
      throw new BadRequestException('Invalid IST report date');
    return date;
  };
  if (!from || !to) throw new BadRequestException('Choose From and To dates');
  const start = parse(from);
  const end = parse(to);
  const dayCount = (end.getTime() - start.getTime()) / 86_400_000;
  if (dayCount < 0 || dayCount > 366) throw new BadRequestException('Choose a date range of up to 367 days');
  if (end.getTime() > Date.now() + 86_400_000) throw new BadRequestException('Future report periods are not allowed');
  return { gte: start, lt: new Date(end.getTime() + 86_400_000) };
}
