// All timestamps are ISO strings in UTC; display is Indian Standard Time (UTC+5:30), 12-hour with am/pm.
export const IST_OFFSET_MIN = 330;
const DAY_MS = 86_400_000;

export interface IstParts { year: number; month: number; day: number; hour: number; minute: number; dow: number }

export function istParts(d: Date | string | number): IstParts {
  const t = new Date(d).getTime() + IST_OFFSET_MIN * 60_000;
  const s = new Date(t);
  return { year: s.getUTCFullYear(), month: s.getUTCMonth() + 1, day: s.getUTCDate(), hour: s.getUTCHours(), minute: s.getUTCMinutes(), dow: s.getUTCDay() };
}

/** Calendar day key in IST, e.g. "2026-10-25". */
export function istDayKey(d: Date | string | number): string {
  const p = istParts(d);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Whole IST calendar days between two instants (b - a). */
export function istDayDiff(a: Date | string | number, b: Date | string | number): number {
  const da = Date.parse(istDayKey(a) + 'T00:00:00Z');
  const db = Date.parse(istDayKey(b) + 'T00:00:00Z');
  return Math.round((db - da) / DAY_MS);
}

export function addDaysIso(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString();
}

export function nowIso(): string { return new Date().toISOString(); }

/** "2:40 pm" from an hour/minute pair in 24h time. */
export function fmt12(hour: number, minute: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const m = Math.round(minute) % 60;
  const ap = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

export function fmtIstClock(d: Date | string | number): string {
  const p = istParts(d);
  return fmt12(p.hour, p.minute);
}

/** Decimal hours (can exceed 24, e.g. 26 = 2:00 am next day) to "2:00 am". */
export function fmtHours(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60) % 24;
  const m = ((total % 60) + 60) % 60;
  return fmt12(h, m);
}

/** Round minutes-of-day to the nearest 10 minutes (e.g. "High tide about 2:40 pm"). */
export function roundTo10(minutesOfDay: number): number {
  return Math.round(minutesOfDay / 10) * 10;
}

export function fmtDateShort(d: Date | string | number): string {
  const p = istParts(d);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${p.day} ${months[p.month - 1]}`;
}

/** ISO instant of 00:00 IST on the IST day of `d`, plus `plusDays` calendar days. Reviews fall due at the start of an IST day. */
export function istStartOfDayIso(d: Date | string | number, plusDays = 0): string {
  const key = istDayKey(d);
  const utcMidnight = Date.parse(key + 'T00:00:00Z');
  return new Date(utcMidnight - IST_OFFSET_MIN * 60_000 + plusDays * DAY_MS).toISOString();
}
