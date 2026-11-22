// Keep manual business dates in India Standard Time, regardless of the device timezone.
export function istSwipeNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const value = key => parts.find(item => item.type === key)?.value ?? "";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, time: `${value("hour")}:${value("minute")}` };
}
export function selectedSwipeTransactionAt(date, time, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const instant = new Date(`${date}T${time}:00+05:30`);
  if (!Number.isFinite(instant.getTime()) || instant.getTime() > now.getTime()) return null;
  // Detect invalid calendar dates rather than letting JS roll over to another day.
  const restored = istSwipeNow(instant);
  if (restored.date !== date || restored.time !== time) return null;
  return instant.toISOString();
}
