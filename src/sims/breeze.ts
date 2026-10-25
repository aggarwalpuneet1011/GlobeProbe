// SIM_BREEZE. Land heats and cools faster than the sea; the surface wind blows from the cooler to the warmer.
import { BaseSim, STEP, lerpColor, type ControlSpec, type Controls } from './engine';
import { clamp } from '../util/rng';
import type { SimId } from '../types';

export const SEA_TEMP = 28;
export const T_MIN = 6;
export const T_MAX = 30;
/**
 * A threshold of 1.0 is too tight: the formula gives delta 2.3 at 9 am and 1.0 at 8 pm, and test T3 wants "Calm" around
 * 9 am and 8 pm. A threshold of 2.5 satisfies T3 and keeps the formula, the 2 pm sea breeze and the 2 am land breeze.
 */
export const CALM_THRESHOLD = 2.5;

export type BreezeMode = 'calm' | 'sea' | 'land';

export const landTemp = (h: number) => 29 + 5 * Math.sin((2 * Math.PI * (h - 8)) / 24);
export const breezeDelta = (h: number) => landTemp(h) - SEA_TEMP;
export function breezeMode(h: number): BreezeMode {
  const d = breezeDelta(h);
  return Math.abs(d) < CALM_THRESHOLD ? 'calm' : d > 0 ? 'sea' : 'land';
}
export const breezeStrength = (h: number) => Math.min(Math.abs(breezeDelta(h)) / 5, 1);
export const BREEZE_LABEL: Record<BreezeMode, string> = {
  calm: 'Calm', sea: 'Sea breeze: wind from the sea', land: 'Land breeze: wind from the land',
};

export const DAY_SKY = '#BFE6FF';
export const SUNSET_SKY = '#FFD6A5';
export const NIGHT_SKY = '#2E3470';
const SKY_KEYS: [number, string][] = [
  [6, SUNSET_SKY], [8, DAY_SKY], [17, DAY_SKY], [18.5, SUNSET_SKY], [20, NIGHT_SKY], [28, NIGHT_SKY], [30, SUNSET_SKY],
];
export function skyAt(t: number): string {
  const h = clamp(t, T_MIN, T_MAX);
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    const [h0, c0] = SKY_KEYS[i]; const [h1, c1] = SKY_KEYS[i + 1];
    if (h >= h0 && h <= h1) return lerpColor(c0, c1, (h - h0) / (h1 - h0));
  }
  return DAY_SKY;
}
export const isNight = (t: number) => t >= 19.5 && t <= 29;

// Circulation loop: low across (y 360), up (x 270, over the land), high back (y 190), down (x 70, over the sea).
const LOOP = [
  { x0: 70, y0: 360, x1: 270, y1: 360 }, // low, sea -> land
  { x0: 270, y0: 360, x1: 270, y1: 190 }, // up over land
  { x0: 270, y0: 190, x1: 70, y1: 190 },  // high, land -> sea
  { x0: 70, y0: 190, x1: 70, y1: 360 },   // down over sea
];
const SEG_LEN = LOOP.map((s) => Math.hypot(s.x1 - s.x0, s.y1 - s.y0));
export const LOOP_LEN = SEG_LEN.reduce((a, b) => a + b, 0);
export const N_PARCELS = 6;

export class BreezeSim extends BaseSim {
  readonly id: SimId = 'SIM_BREEZE';
  readonly s = new Float32Array(N_PARCELS);   // arc length position along the loop
  readonly px = new Float32Array(N_PARCELS);
  readonly py = new Float32Array(N_PARCELS);
  readonly cool = new Float32Array(N_PARCELS); // 0 warm .. 1 cool

  constructor(seed: number, params: Record<string, number> = {}) { super(seed, params); this.reset(); }

  specs(): Record<string, ControlSpec> {
    return { time: { kind: 'num', min: T_MIN, max: T_MAX }, playing: { kind: 'bool' } };
  }
  protected defaults(): Controls { return { time: 15, playing: false }; }
  protected onReset(): void {
    for (let i = 0; i < N_PARCELS; i++) this.s[i] = (i / N_PARCELS) * LOOP_LEN;
    this.place();
  }

  get hours(): number { return this.num('time'); }
  get mode(): BreezeMode { return breezeMode(this.hours); }
  get seaTemp(): number { return SEA_TEMP; }
  get landTemp(): number { return landTemp(this.hours); }
  get label(): string { return BREEZE_LABEL[this.mode]; }
  /** Arrow thickness 4..12 units and parcel speed 20..60 units/s from the strength. */
  get arrowThickness(): number { return 4 + 8 * breezeStrength(this.hours); }
  get parcelSpeed(): number { return 20 + 40 * breezeStrength(this.hours); }

  /** Play runs at 1 hour per second. */
  protected onStep(): void {
    if (this.bool('playing')) {
      const t = this.num('time') + STEP;
      if (t >= T_MAX) { this.controls.time = T_MAX; this.controls.playing = false; } else this.controls.time = t;
    }
    const mode = this.mode;
    if (mode !== 'calm') {
      const dir = mode === 'sea' ? 1 : -1;
      const v = this.parcelSpeed * dir * STEP;
      for (let i = 0; i < N_PARCELS; i++) this.s[i] = (((this.s[i] + v) % LOOP_LEN) + LOOP_LEN) % LOOP_LEN;
    }
    this.place();
  }

  private place(): void {
    const dir = this.mode === 'land' ? -1 : 1;
    for (let i = 0; i < N_PARCELS; i++) {
      let d = this.s[i]; let seg = 0;
      while (seg < 3 && d > SEG_LEN[seg]) { d -= SEG_LEN[seg]; seg++; }
      const p = clamp(d / SEG_LEN[seg], 0, 1);
      const L = LOOP[seg];
      this.px[i] = L.x0 + (L.x1 - L.x0) * p; this.py[i] = L.y0 + (L.y1 - L.y0) * p;
      // Temperature: air warms over the hot surface and rises, cools aloft and sinks.
      if (dir === 1) this.cool[i] = seg === 0 ? 1 - p : seg === 1 ? 0 : seg === 2 ? p : 1;
      else this.cool[i] = seg === 0 ? p : seg === 1 ? 1 : seg === 2 ? 1 - p : 0;
    }
  }

  metrics(): Record<string, number> {
    const m = this.mode;
    return {
      calm: m === 'calm' ? 1 : 0, seaBreeze: m === 'sea' ? 1 : 0, landBreeze: m === 'land' ? 1 : 0,
      landTemp: this.landTemp, seaTemp: SEA_TEMP, delta: breezeDelta(this.hours), time: this.hours,
    };
  }
}
