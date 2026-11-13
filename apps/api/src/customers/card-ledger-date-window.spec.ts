import { cardLedgerDateWindow } from './card-ledger-date-window';

describe('Indian business-date Card Ledger filtering', () => {
  it('keeps old API requests as all time', () => {
    expect(cardLedgerDateWindow()).toBeNull();
  });
  it('includes the first minute and last millisecond of an IST business day', () => {
    const period = cardLedgerDateWindow('2026-11-12', '2026-11-12')!;
    expect(period.start.toISOString()).toBe('2026-11-11T18:30:00.000Z');
    expect(period.end.toISOString()).toBe('2026-11-12T18:30:00.000Z');
    expect(new Date('2026-11-11T18:29:59.999Z') >= period.start).toBe(false);
    expect(new Date('2026-11-12T18:29:59.999Z') < period.end).toBe(true);
    expect(new Date('2026-11-12T18:30:00.000Z') < period.end).toBe(false);
  });
  it('handles inclusive date ranges spanning months', () => {
    const period = cardLedgerDateWindow('2026-10-31', '2026-11-02')!;
    expect(period.end.getTime() - period.start.getTime()).toBe(3 * 86400000);
  });
  it.each([['2026-02-30', '2026-03-01'], ['2026-11-14', '2026-11-13'], ['2026-11-01', ''], ['', '2026-11-01']])(
    'rejects invalid dates %s through %s', (from,to) => {
      expect(() => cardLedgerDateWindow(from, to)).toThrow();
    },
  );
});
