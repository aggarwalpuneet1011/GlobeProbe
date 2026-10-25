// Tides from hourly sea-level data.
import { fmt12, roundTo10 } from '../util/time';

export interface TidePoint { index: number; hour: number; kind: 'high' | 'low'; level: number }

/** Find highs and lows in a series and refine their time with a parabola through the three points. `hour` is index + offset. */
export function findTides(v: number[]): TidePoint[] {
  const out: TidePoint[] = [];
  for (let i = 1; i < v.length - 1; i++) {
    const high = v[i] > v[i - 1] && v[i] >= v[i + 1];
    const low = v[i] < v[i - 1] && v[i] <= v[i + 1];
    if (!high && !low) continue;
    const den = v[i - 1] - 2 * v[i] + v[i + 1];
    let off = den === 0 ? 0 : (0.5 * (v[i - 1] - v[i + 1])) / den;
    if (!Number.isFinite(off) || Math.abs(off) > 1) off = 0;
    const a = v[i - 1], b = v[i], c = v[i + 1];
    const level = den === 0 ? b : b - ((a - c) * (a - c)) / (8 * den);
    out.push({ index: i, hour: i + off, kind: high ? 'high' : 'low', level });
  }
  return out;
}

export interface TideCheck { ok: boolean; reason?: string }
/** In each 24 h window there must be 1..3 highs and 1..3 lows, and high - low >= 0.3 m. Otherwise hide the card. */
export function sanityCheck(v: number[], pts: TidePoint[]): TideCheck {
  if (v.length < 24) return { ok: false, reason: 'short series' };
  let windows = 0;
  for (let s = 0; s + 24 <= v.length; s += 24) {
    const inWin = pts.filter((p) => p.hour >= s && p.hour < s + 24);
    const highs = inWin.filter((p) => p.kind === 'high'); const lows = inWin.filter((p) => p.kind === 'low');
    if (highs.length < 1 || highs.length > 3 || lows.length < 1 || lows.length > 3) return { ok: false, reason: `window ${windows}: ${highs.length} highs, ${lows.length} lows` };
    const range = Math.max(...highs.map((p) => p.level)) - Math.min(...lows.map((p) => p.level));
    if (range < 0.3) return { ok: false, reason: `window ${windows}: range ${range.toFixed(2)} m` };
    windows++;
  }
  return windows ? { ok: true } : { ok: false, reason: 'no full window' };
}

/** "2:40 pm" for a fractional hour index within the series, rounded to the nearest 10 minutes; `startHour` is the clock hour of index 0. */
export function clockFor(hourIndex: number, startHour = 0): string {
  const mins = roundTo10(((hourIndex + startHour) * 60) % (24 * 60));
  const m = ((mins % 1440) + 1440) % 1440;
  return fmt12(Math.floor(m / 60), m % 60);
}
export const highLine = (t: string) => `High tide about ${t}`;
export const lowLine = (t: string) => `Low tide about ${t}`;
export const walkLine = (t: string) => `Low tide about ${t}: the path is usually walkable around then. Always check with a grown-up.`;
