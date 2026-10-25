// Open-Meteo parsing, caching rules and fetch orchestration. `fetch` is injected so this is testable offline.
import { LIVE_PLACES, tideUrl, weatherUrl, type LivePlace } from './places';
import { findTides, sanityCheck, type TidePoint } from './tides';
import { istDayKey, fmtIstClock, fmtDateShort } from '../util/time';

export interface WeatherNow { time: string; tempC: number; humidity: number; precipMm: number; code: number; windKmh: number; windDeg: number; isDay: boolean }
export interface WeatherSnap { placeId: string; fetchedAt: string; now: WeatherNow; daily: { date: string; mm: number }[] }
export interface TideSnap { placeId: string; fetchedAt: string; times: string[]; heights: number[] }

export const MIN_REFETCH_MIN = 15;
export const STALE_AFTER_MIN = 60;
export const HIDE_AFTER_HOURS = 48;

/** Fetch when Home or Sky Today opens, if online and the cache is older than 60 min; never more than once per 15 min. */
export function shouldFetch(online: boolean, lastFetchIso: string | null, nowIso: string): boolean {
  if (!online) return false;
  if (!lastFetchIso) return true;
  const ageMin = (Date.parse(nowIso) - Date.parse(lastFetchIso)) / 60000;
  return ageMin >= STALE_AFTER_MIN && ageMin >= MIN_REFETCH_MIN;
}
export type CacheState = 'fresh' | 'stale' | 'hidden';
export function cacheState(fetchedAtIso: string | null, nowIso: string): CacheState {
  if (!fetchedAtIso) return 'hidden';
  const ageH = (Date.parse(nowIso) - Date.parse(fetchedAtIso)) / 3600000;
  if (ageH > HIDE_AFTER_HOURS) return 'hidden';
  return ageH * 60 < STALE_AFTER_MIN ? 'fresh' : 'stale';
}
export function lastCheckedLabel(fetchedAtIso: string, nowIso: string): string {
  const same = istDayKey(fetchedAtIso) === istDayKey(nowIso);
  return `Last checked ${same ? '' : fmtDateShort(fetchedAtIso) + ', '}${fmtIstClock(fetchedAtIso)}`;
}

/** Open-Meteo local times look like "2026-10-25T14:00" in the requested zone (Asia/Kolkata). */
export const istLocalToIso = (s: string) => new Date(s.length === 16 ? s + ':00+05:30' : s).toISOString();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseWeather(placeId: string, json: any, fetchedAt: string): WeatherSnap | null {
  const c = json?.current;
  if (!c || typeof c.temperature_2m !== 'number') return null;
  const times: string[] = json?.daily?.time ?? []; const sums: (number | null)[] = json?.daily?.precipitation_sum ?? [];
  const daily = times.map((date, i) => ({ date, mm: typeof sums[i] === 'number' ? (sums[i] as number) : 0 }));
  return {
    placeId, fetchedAt,
    now: {
      time: c.time, tempC: c.temperature_2m, humidity: c.relative_humidity_2m, precipMm: c.precipitation ?? 0,
      code: c.weather_code, windKmh: c.wind_speed_10m, windDeg: c.wind_direction_10m, isDay: c.is_day === 1,
    },
    daily,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseTide(placeId: string, json: any, fetchedAt: string): TideSnap | null {
  const t: string[] = json?.hourly?.time; const h: (number | null)[] = json?.hourly?.sea_level_height_msl;
  if (!Array.isArray(t) || !Array.isArray(h) || t.length !== h.length || t.length < 24) return null;
  if (h.some((x) => typeof x !== 'number')) return null;
  return { placeId, fetchedAt, times: t, heights: h as number[] };
}

export const rainTotal = (s: WeatherSnap | undefined) => (s ? s.daily.slice(-7).reduce((a, d) => a + d.mm, 0) : null);

export interface TideDay { highs: { clock: number; level: number }[]; lows: { clock: number; level: number }[]; curve: number[]; ok: boolean }
/** Tide highs and lows for the IST day containing `nowIso`, with the 24 hourly points for the mini curve. */
export function tidesForDay(s: TideSnap, nowIso: string): TideDay | null {
  const pts = findTides(s.heights);
  if (!sanityCheck(s.heights, pts).ok) return null;
  const dayKey = istDayKey(nowIso);
  const start = s.times.findIndex((t) => t.startsWith(dayKey));
  if (start < 0) return null;
  const sel = (p: TidePoint) => p.hour >= start && p.hour < start + 24;
  const clock = (p: TidePoint) => p.hour - start;
  const mk = (k: 'high' | 'low') => pts.filter((p) => p.kind === k && sel(p)).map((p) => ({ clock: clock(p), level: p.level }));
  const curve = s.heights.slice(start, start + 24);
  if (curve.length < 24) return null;
  return { highs: mk('high'), lows: mk('low'), curve, ok: true };
}

export interface FetchLike { (url: string): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> }

/** All places in parallel; a failed place is simply missing from the result. */
export async function fetchAll(fetchImpl: FetchLike, nowIso: string, places: LivePlace[] = LIVE_PLACES): Promise<{ weather: WeatherSnap[]; tide: TideSnap | null }> {
  const get = async (url: string, ms = 10000): Promise<unknown> => {
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
    const r = await Promise.race([fetchImpl(url), timeout]);
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json();
  };
  const weatherPlaces = places.filter((p) => p.id !== 'hajiali');
  const results = await Promise.allSettled(weatherPlaces.map(async (p) => parseWeather(p.id, await get(weatherUrl(p)), nowIso)));
  const weather = results.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []));
  const hp = places.find((p) => p.id === 'hajiali');
  let tide: TideSnap | null = null;
  if (hp) { try { tide = parseTide(hp.id, await get(tideUrl(hp)), nowIso); } catch { tide = null; } }
  return { weather, tide };
}
