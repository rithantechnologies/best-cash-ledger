// Retry windows are example defaults in India Standard Time (Asia/Kolkata).
// A future settings page may replace these values without changing task history.
export function retryReminder(now = new Date(), later = false): Date {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  const day = `${get('year')}-${get('month')}-${get('day')}`;
  const minute = Number(get('hour')) * 60 + Number(get('minute'));
  if (!later && ((minute >= 480 && minute < 600) || (minute >= 900 && minute < 960)))
    return now;
  if (!later && minute < 480) return new Date(day + 'T08:00:00+05:30');
  if (minute < 900) return new Date(day + 'T15:00:00+05:30');
  const nextDay = new Date(day + 'T08:00:00+05:30');
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return nextDay;
}
