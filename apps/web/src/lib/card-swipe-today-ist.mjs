// The business date selector shows today's IST date. Today's swipes use
// the server's real current timestamp, not a reconstructed midnight time.
export function todayIst(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const p = type => parts.find(part => part.type === type)?.value ?? '';
  return p('year')+'-'+p('month')+'-'+p('day');
}
export function transactionAtForBusinessDate(date, now = new Date()) {
  if (!date || date === todayIst(now)) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayIst(now))
    throw new Error('Choose today or an earlier IST business date');
  const clock = new Intl.DateTimeFormat('en-GB',{
    timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',second:'2-digit',
    hourCycle:'h23',
  }).formatToParts(now);
  const p = type => clock.find(part => part.type === type)?.value ?? '';
  const timestamp = new Date(date+'T'+p('hour')+':'+p('minute')+':'+p('second')+'+05:30');
  if (!Number.isFinite(timestamp.getTime()) || todayIst(timestamp)!==date)throw new Error('Invalid IST business date');
  return timestamp.toISOString();
}
