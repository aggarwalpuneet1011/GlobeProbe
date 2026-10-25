// SIM_TIDE. Pure cosine tide: period 12.42 h, amplitude 2.0 m, 1 m = 18 world units.
import { BaseSim, STEP, type ControlSpec, type Controls } from './engine';
import type { SimId } from '../types';

export const TIDE_PERIOD = 12.42;
export const TIDE_AMPLITUDE = 2.0;
export const METRE = 18;
export const CAUSEWAY_TOP_M = 0.6;
export const TIDE_HOURS = 48;
export const HIGH_TOLERANCE = 0.96; // "at high tide": level within 4% of the crest

export const tideLevel = (t: number, tHigh0: number, amp = TIDE_AMPLITUDE) =>
  amp * Math.cos((2 * Math.PI * (t - tHigh0)) / TIDE_PERIOD);

export interface Extremum { t: number; kind: 'high' | 'low' }
/** Highs and lows between `from` and `to` hours (used by the 48 h chart arrows). */
export function tideExtrema(tHigh0: number, from = 0, to = TIDE_HOURS): Extremum[] {
  const out: Extremum[] = [];
  const half = TIDE_PERIOD / 2;
  const k0 = Math.floor((from - tHigh0) / half) - 1;
  const k1 = Math.ceil((to - tHigh0) / half) + 1;
  for (let k = k0; k <= k1; k++) {
    const t = tHigh0 + k * half;
    if (t >= from && t <= to) out.push({ t, kind: k % 2 === 0 ? 'high' : 'low' });
  }
  return out;
}

export class TideSim extends BaseSim {
  readonly id: SimId = 'SIM_TIDE';
  maxLevelSoFar = -Infinity; // high-tide marker on the rocks: highest level reached so far

  constructor(seed: number, params: Record<string, number> = {}) { super(seed, params); this.reset(); }

  get tHigh0(): number { return this.params.tHigh0 ?? 0.7833; }
  specs(): Record<string, ControlSpec> { return { time: { kind: 'num', min: 0, max: TIDE_HOURS }, playing: { kind: 'bool' } }; }
  protected defaults(): Controls { return { time: 6, playing: false }; }
  protected onReset(): void { this.maxLevelSoFar = this.level; }
  protected onControl(id: string): void { if (id === 'time') this.track(); }

  get hours(): number { return this.num('time'); }
  get level(): number { return tideLevel(this.hours, this.tHigh0); }
  get covered(): boolean { return this.level > CAUSEWAY_TOP_M; }
  private track(): void { if (this.level > this.maxLevelSoFar) this.maxLevelSoFar = this.level; }

  protected onStep(): void {
    if (this.bool('playing')) {
      const t = this.num('time') + STEP;
      if (t >= TIDE_HOURS) { this.controls.time = TIDE_HOURS; this.controls.playing = false; } else this.controls.time = t;
    }
    this.track();
  }

  metrics(): Record<string, number> {
    return {
      level: this.level, causewayCovered: this.covered ? 1 : 0,
      atHighTide: this.level >= TIDE_AMPLITUDE * HIGH_TOLERANCE ? 1 : 0, maxLevelSoFar: this.maxLevelSoFar, time: this.hours,
    };
  }
}
