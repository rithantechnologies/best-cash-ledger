/** Human-facing report dates are DD-MM-YYYY; API filters remain ISO YYYY-MM-DD. */
export function indianDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : iso;
}

export function reportIsoDate(text: string): string | null {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const day = Number(match[1]); const month = Number(match[2]); const year = Number(match[3]);
  if (year < 1900 || year > 9999) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function indianDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const p = (name: string) => parts.find(part => part.type === name)?.value ?? "";
  return `${p("day")}-${p("month")}-${p("year")} ${p("hour")}:${p("minute")}`;
}
