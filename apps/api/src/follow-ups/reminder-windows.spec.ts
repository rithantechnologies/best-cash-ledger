import { describe, expect, it } from 'vitest';
import { retryReminder } from './reminder-windows.js';

describe('in-app gateway retry reminders (India Standard Time)', () => {
  it('defaults to 8 AM IST before the morning window', () => {
    expect(retryReminder(new Date('2026-11-24T01:00:00Z')).toISOString())
      .toBe('2026-11-24T02:30:00.000Z');
  });
  it('marks the retry due during the morning and afternoon windows', () => {
    const morning = new Date('2026-11-24T03:40:00Z');
    const afternoon = new Date('2026-11-24T10:00:00Z');
    expect(retryReminder(morning).toISOString()).toBe(morning.toISOString());
    expect(retryReminder(afternoon).toISOString()).toBe(afternoon.toISOString());
  });
  it('schedules the afternoon when the morning window is missed', () => {
    expect(retryReminder(new Date('2026-11-24T06:00:00Z')).toISOString())
      .toBe('2026-11-24T09:30:00.000Z');
  });
  it('uses next morning after afternoon closes', () => {
    expect(retryReminder(new Date('2026-11-24T11:30:00Z')).toISOString())
      .toBe('2026-11-25T02:30:00.000Z');
  });
  it('Remind Later advances to the next slot instead of staying due now', () => {
    expect(retryReminder(new Date('2026-11-24T03:00:00Z'), true).toISOString())
      .toBe('2026-11-24T09:30:00.000Z');
    expect(retryReminder(new Date('2026-11-24T09:45:00Z'), true).toISOString())
      .toBe('2026-11-25T02:30:00.000Z');
  });
});
