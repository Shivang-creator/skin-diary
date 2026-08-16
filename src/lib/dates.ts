/**
 * Calendar-day helpers.
 *
 * Everything in Skin Diary keys off a local YYYY-MM-DD string rather than
 * a timestamp. A diary is a thing you fill in "today", and timezone
 * arithmetic on Date objects is a reliable source of off-by-one-day bugs
 * that would silently misalign a lag analysis.
 */

export type DayKey = string; // YYYY-MM-DD

export function toDayKey(d: Date): DayKey {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey(): DayKey {
  return toDayKey(new Date());
}

/** Parse a day key into a Date at local midnight. */
export function fromDayKey(key: DayKey): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: DayKey, days: number): DayKey {
  const d = fromDayKey(key);
  d.setDate(d.getDate() + days);
  return toDayKey(d);
}

/** Whole days from `a` to `b` (b - a). */
export function daysBetween(a: DayKey, b: DayKey): number {
  const MS = 24 * 60 * 60 * 1000;
  // Normalise to UTC noon to sidestep DST transitions.
  const da = fromDayKey(a);
  const db = fromDayKey(b);
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / MS);
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatDay(key: DayKey): string {
  const d = fromDayKey(key);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function formatDayLong(key: DayKey): string {
  const d = fromDayKey(key);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function relativeDay(key: DayKey): string {
  const diff = daysBetween(key, todayKey());
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  return formatDay(key);
}
