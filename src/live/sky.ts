// Child-facing summaries of the live data. Pure: takes snapshots, returns words.
import type { TideSnap, WeatherSnap } from './openmeteo';
import { tidesForDay } from './openmeteo';
import { breezeLine, compass8, rainAmountWord, seaLand, SEA_LAND_WORDS, weatherWord, windFromLine, windStrengthWord } from './translate';
import { fmtHours, istDayKey, istParts } from '../util/time';
import { highLine, lowLine } from './tides';

export interface TideEvent { kind: 'high' | 'low'; clock: number; label: string }

/** Tide events for today (IST), sorted by time, with the next upcoming one marked. */
export function tideEvents(tide: TideSnap | null, nowIso: string): { events: TideEvent[]; next: TideEvent | null; curve: number[]; nowHour: number } | null {
  if (!tide) return null;
  const day = tidesForDay(tide, nowIso);
  if (!day) return null;
  const mk = (kind: 'high' | 'low', c: number): TideEvent => {
    const t = fmtHours(Math.round(c * 6) / 6);
    return { kind, clock: c, label: kind === 'high' ? highLine(t) : lowLine(t) };
  };
  const events = [...day.highs.map((h) => mk('high', h.clock)), ...day.lows.map((l) => mk('low', l.clock))].sort((a, b) => a.clock - b.clock);
  const p = istParts(nowIso);
  const nowHour = p.hour + p.minute / 60;
  const next = events.find((e) => e.clock > nowHour) ?? null;
  return { events, next, curve: day.curve, nowHour };
}

export interface MumbaiNow {
  windLine: string;           // "Wind from the west, from the sea"
  windShort: string;          // "Wind from the sea"
  strength: string;           // "a gentle breeze"
  breeze: string | null;      // "Sea breeze is on"
  tempC: number; humidity: number;
  weather: { word: string; icon: string } | null;
  rainTodayMm: number; rainWord: string;
  /** Degrees the wind comes FROM, for drawing the arrow (arrow points where it goes). */
  fromDeg: number; windKmh: number;
}

export function mumbaiNow(w: WeatherSnap | undefined, nowIso: string): MumbaiNow | null {
  if (!w) return null;
  const n = w.now;
  const hour = istParts(nowIso).hour;
  const today = w.daily.find((d) => d.date === istDayKey(nowIso)) ?? w.daily[w.daily.length - 1];
  const mm = today?.mm ?? 0;
  const sl = seaLand(n.windDeg);
  const ww = weatherWord(n.code);
  return {
    windLine: windFromLine(n.windDeg),
    windShort: `Wind ${sl === 'coast' ? 'along the coast' : SEA_LAND_WORDS[sl]}`,
    strength: windStrengthWord(n.windKmh),
    breeze: breezeLine(hour, n.windDeg, n.windKmh),
    tempC: Math.round(n.tempC), humidity: Math.round(n.humidity),
    weather: ww ? { word: ww.word, icon: ww.icon } : null,
    rainTodayMm: mm, rainWord: rainAmountWord(mm),
    fromDeg: n.windDeg, windKmh: n.windKmh,
  };
}

/** The wind from `deg` blows toward deg+180. Screen rotation (degrees clockwise from "up = north") for an arrow that points where the wind GOES. */
export const arrowRotation = (fromDeg: number) => (fromDeg + 180) % 360;

export const compassWord = compass8;

export interface RainBar { id: string; name: string; mm: number }
export function rainRace(weather: Record<string, WeatherSnap>): RainBar[] {
  const names: Record<string, string> = { mum: 'Mumbai', pune: 'Pune', sohra: 'Cherrapunji', jsm: 'Jaisalmer' };
  return (['sohra', 'mum', 'pune', 'jsm'] as const).flatMap((id) => {
    const w = weather[id];
    if (!w) return [];
    const mm = w.daily.slice(-7).reduce((a, d) => a + d.mm, 0);
    return [{ id, name: names[id], mm: Math.round(mm * 10) / 10 }];
  });
}
