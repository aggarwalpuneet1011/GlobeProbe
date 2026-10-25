// SIM_MOUNTAIN, the hero sim. Wet air climbs the sea side, cools, makes cloud and rain, then sinks dry.
//
// Design decisions (each is needed to make acceptance test T2 and the Lab checks true):
//  1. Gauges are rain DEPTH (drops per unit width) over a catchment, read from a sliding 20 s window.
//     Mumbai = land from x 80 to 200 (the sea side of the peak), Pune = x 200 to 360 (the far side). The first catchments, "x 40..90"
//     and "x 300..360", never receive the drops that fall on the slope (x ~144..200).
//  2. "No lift" (flat rule) applies when H <= LIFT_MIN (62), the height where climbing air first reaches the cloud line,
//     instead of H < 40, so there is no dead zone with neither lift nor flat-rule rain between H 40 and 62.
//  3. Light showers on the plain near Pune (the far side still gets a little rain; T2 needs Pune > 0 and a 3x ratio).
//     They come from a separate thin cloud over the plain, never from descending air.
//  4. Air from the land (moisture 0.25, below the 0.3 threshold) leaks a tiny drizzle (3 per second x moisture).
import { BaseSim, Pool, STEP, smoothstep, type ControlSpec, type Controls } from './engine';
import { clamp } from '../util/rng';
import type { SimId } from '../types';

export const GROUND_Y = 400;
export const CLOUD_LINE_Y = 320;
export const PEAK_X = 200;
export const BASE_X0 = 100;
export const BASE_X1 = 300;
export const LAND_X0 = 80;
export const LAND_X1 = 360;
export const MUMBAI_X = 50;
export const PUNE_X = 330;
export const PARCEL_LIFT = 18;
export const PARCEL_SPEED = 45;
export const SPAWN_EVERY = 0.6;
export const RAIN_MOISTURE_MIN = 0.3;
export const MOISTURE_LOSS = 0.35;
export const LIFT_MIN = GROUND_Y - PARCEL_LIFT - CLOUD_LINE_Y; // 62: peak height where climbing air reaches the cloud line
export const CELLS = 12;
export const CELL_W = (LAND_X1 - LAND_X0) / CELLS;
export const WINDOW_SECONDS = 20;
export const DROP_FALL_SPEED = 140;
export const DROP_START_LIFT = 26;
export const MUMBAI_CATCH = { x0: 80, x1: 200 };
export const PUNE_CATCH = { x0: 200, x1: 360 };
export const SHOWER_X0 = 300;
export const SHOWER_X1 = 360;
export const SHOWER_START_Y = 250;

/** Tuning constants (set by tests/mountain.test.ts against acceptance test T2). */
export const GAUGE_SCALE = 0.17;
export const SHOWER_K = 33;
export const CELL_REF = 200;

export type WindMode = 'sea' | 'off' | 'land';
export const DROP_ORO = 0;
export const DROP_FLAT = 1;
export const DROP_SHOWER = 2;
export const DROP_LEAK = 3;

export function mountainProfile(x: number, H: number): number {
  if (x <= BASE_X0 || x >= BASE_X1) return 0;
  return x <= PEAK_X ? (H * (x - BASE_X0)) / (PEAK_X - BASE_X0) : (H * (BASE_X1 - x)) / (BASE_X1 - PEAK_X);
}
export const groundY = (x: number, H: number) => GROUND_Y - mountainProfile(x, H);

export class MountainSim extends BaseSim {
  readonly id: SimId = 'SIM_MOUNTAIN';
  readonly parcels = new Pool(40);     // a = moisture, b = drop accumulator, c = puff accumulator; vx = dir * speed
  readonly parcelAlpha = new Float32Array(40);
  readonly parcelDir = new Int8Array(40);
  readonly parcelTag = new Uint8Array(40);      // 1 = show the "dry air" tag on this parcel
  readonly parcelFade = new Uint8Array(40);
  readonly drops = new Pool(260);               // kind = source (DROP_*)
  readonly puffs = new Pool(24);                // a = age, b = life
  readonly cellBins = new Uint16Array(CELLS * WINDOW_SECONDS);
  readonly mumbaiBins = new Uint16Array(WINDOW_SECONDS);
  readonly puneBins = new Uint16Array(WINDOW_SECONDS);
  /** Largest x any drop from a descending parcel ever landed at (always 0: descending parcels never emit). */
  descendingDropMaxX = 0;
  private spawnT = 0;
  private puffT = 0;
  private bank = 0;           // shower drops waiting to be released
  private showerAcc = 0;
  private flatAcc = 0;
  private leakAcc = 0;
  private seqFlat = 0;
  private seqShower = 0;
  private binSec = -1;
  private lastTag = -10;

  constructor(seed: number, params: Record<string, number> = {}) { super(seed, params); this.reset(); }

  specs(): Record<string, ControlSpec> {
    return { H: { kind: 'num', min: 0, max: 220 }, wind: { kind: 'enum', values: ['sea', 'off', 'land'] } };
  }
  protected defaults(): Controls { return { H: 140, wind: 'sea' }; }
  protected onReset(): void {
    this.parcels.clear(); this.drops.clear(); this.puffs.clear();
    this.parcelAlpha.fill(0); this.parcelDir.fill(0); this.parcelTag.fill(0); this.parcelFade.fill(0);
    this.cellBins.fill(0); this.mumbaiBins.fill(0); this.puneBins.fill(0);
    this.spawnT = SPAWN_EVERY; this.puffT = 0; this.bank = 0; this.showerAcc = 0; this.flatAcc = 0; this.leakAcc = 0;
    this.seqFlat = 0; this.seqShower = 0; this.binSec = -1; this.lastTag = -10; this.descendingDropMaxX = 0;
  }
  protected onControl(id: string): void {
    if (id === 'wind' && this.str('wind') === 'off') {
      for (let i = 0; i < this.parcels.size; i++) if (this.parcels.active[i]) this.parcelFade[i] = 1;
    }
  }

  get H(): number { return this.num('H'); }
  get wind(): WindMode { return this.str('wind') as WindMode; }
  get flat(): boolean { return this.H <= LIFT_MIN; }

  private climbing(i: number): boolean {
    return this.parcelDir[i] > 0 ? this.parcels.x[i] < PEAK_X : this.parcels.x[i] > PEAK_X;
  }
  /** True while the parcel is on the way down the far side (used by the "dry air" tag and by tests). */
  isDescending(i: number): boolean { return this.parcels.active[i] === 1 && !this.climbing(i); }

  protected onStep(): void {
    const H = this.H; const P = this.parcels;
    // Rotate the sliding window one bin per second.
    const sec = Math.floor(this.time);
    if (sec !== this.binSec) {
      this.binSec = sec;
      const b = sec % WINDOW_SECONDS;
      for (let c = 0; c < CELLS; c++) this.cellBins[c * WINDOW_SECONDS + b] = 0;
      this.mumbaiBins[b] = 0; this.puneBins[b] = 0;
    }

    // Spawn.
    if (this.wind !== 'off') {
      this.spawnT += STEP;
      if (this.spawnT >= SPAWN_EVERY) {
        this.spawnT -= SPAWN_EVERY;
        const i = P.alloc();
        if (i >= 0) {
          const fromSea = this.wind === 'sea';
          P.x[i] = fromSea ? 0 : 360; P.a[i] = fromSea ? 1 : 0.25; P.b[i] = 0; P.c[i] = 0;
          this.parcelDir[i] = fromSea ? 1 : -1; this.parcelAlpha[i] = 1; this.parcelFade[i] = 0; this.parcelTag[i] = 0;
          P.y[i] = groundY(P.x[i], H) - PARCEL_LIFT;
        }
      }
    }

    // Parcels.
    for (let i = 0; i < P.size; i++) {
      if (!P.active[i]) continue;
      const prevX = P.x[i];
      const dir = this.parcelDir[i];
      if (this.parcelFade[i]) {
        this.parcelAlpha[i] -= STEP / 2; // fade out over 2 s
        if (this.parcelAlpha[i] <= 0) { P.free(i); continue; }
      }
      P.x[i] += dir * PARCEL_SPEED * STEP;
      if (P.x[i] < -4 || P.x[i] > 364) { P.free(i); continue; }
      P.y[i] = groundY(P.x[i], H) - PARCEL_LIFT;

      // Crossing the peak: tag the first descending parcel each cycle; sea air hands its leftover moisture to the plain showers.
      const crossed = dir > 0 ? prevX < PEAK_X && P.x[i] >= PEAK_X : prevX > PEAK_X && P.x[i] <= PEAK_X;
      if (crossed && !this.parcelFade[i]) {
        if (this.time - this.lastTag >= 4) { this.parcelTag[i] = 1; this.lastTag = this.time; }
        if (dir > 0 && !this.flat) {
          const m = P.a[i];
          const rainedOut = 1 - m;
          this.bank += SHOWER_K * Math.max(0, m - RAIN_MOISTURE_MIN) * Math.min(1, (rainedOut / 0.35) ** 2);
        }
      }

      // Rain only while climbing and above the cloud line. Descending air never emits anything.
      if (this.parcelFade[i] || this.flat || !this.climbing(i) || P.y[i] >= CLOUD_LINE_Y) continue;
      const m = P.a[i];
      if (m > RAIN_MOISTURE_MIN) {
        P.c[i] += STEP;
        if (P.c[i] >= 0.5) { P.c[i] -= 0.5; this.spawnPuff(P.x[i], P.y[i]); }
        P.b[i] += 18 * m * STEP;
        while (P.b[i] >= 1) { P.b[i] -= 1; this.spawnDrop(P.x[i], P.y[i] - DROP_START_LIFT, DROP_ORO); }
        P.a[i] = Math.max(0, m - MOISTURE_LOSS * STEP);
      } else if (m > 0) {
        this.leakAcc += 3 * m * STEP; // tiny drizzle leaks past the rain threshold (shared accumulator: one parcel emits < 1 drop)
        while (this.leakAcc >= 1) { this.leakAcc -= 1; this.spawnDrop(P.x[i], P.y[i] - DROP_START_LIFT, DROP_LEAK); }
      }
    }

    // No lift: drops at 3 per second x moisture, spread evenly over all land.
    if (this.flat && this.wind !== 'off') {
      const m = this.wind === 'sea' ? 1 : 0.25;
      this.flatAcc += 3 * m * STEP;
      while (this.flatAcc >= 1) {
        this.flatAcc -= 1;
        this.seqFlat++;
        const x = LAND_X0 + (LAND_X1 - LAND_X0) * ((this.seqFlat * 0.6180339887) % 1);
        this.spawnDrop(x, CLOUD_LINE_Y - 20, DROP_FLAT);
      }
    }

    // Plain showers (released at a steady pace from the bank).
    if (this.bank > 0) {
      const give = Math.min(this.bank, 14 * STEP);
      this.bank -= give; this.showerAcc += give;
      while (this.showerAcc >= 1) {
        this.showerAcc -= 1;
        this.seqShower++;
        const x = SHOWER_X0 + (SHOWER_X1 - SHOWER_X0) * ((this.seqShower * 0.6180339887) % 1);
        this.spawnDrop(x, SHOWER_START_Y, DROP_SHOWER);
      }
    }

    // Drops fall straight down.
    const D = this.drops;
    for (let i = 0; i < D.size; i++) {
      if (!D.active[i]) continue;
      D.y[i] += D.vy[i] * STEP;
      if (D.y[i] >= groundY(D.x[i], H)) { this.land(D.x[i], D.kind[i]); D.free(i); }
    }

    // Cloud puffs age.
    const C = this.puffs;
    for (let i = 0; i < C.size; i++) {
      if (!C.active[i]) continue;
      C.a[i] += STEP;
      if (C.a[i] >= C.b[i]) C.free(i);
    }
  }

  private spawnDrop(x: number, y: number, src: number): void {
    const i = this.drops.alloc();
    if (i < 0) return;
    this.drops.x[i] = x; this.drops.y[i] = y; this.drops.vy[i] = DROP_FALL_SPEED; this.drops.kind[i] = src;
  }
  private spawnPuff(x: number, y: number): void {
    const i = this.puffs.alloc();
    if (i < 0) return;
    this.puffs.x[i] = x; this.puffs.y[i] = y - 16; this.puffs.a[i] = 0; this.puffs.b[i] = 3;
  }
  private land(x: number, _src: number): void {
    const b = Math.floor(this.time) % WINDOW_SECONDS;
    if (x < LAND_X0 || x >= LAND_X1) return;
    const cell = Math.min(CELLS - 1, Math.floor((x - LAND_X0) / CELL_W));
    this.cellBins[cell * WINDOW_SECONDS + b]++;
    if (x < PEAK_X) this.mumbaiBins[b]++; else this.puneBins[b]++;
  }

  private sum(a: Uint16Array, from = 0, to = a.length): number { let s = 0; for (let i = from; i < to; i++) s += a[i]; return s; }

  /** Gauge readings: rain depth over the catchment in the last 20 s, scaled so a full tube is about 1. */
  get mumbaiGauge(): number { return (this.sum(this.mumbaiBins) / (MUMBAI_CATCH.x1 - MUMBAI_CATCH.x0)) * GAUGE_SCALE; }
  get puneGauge(): number { return (this.sum(this.puneBins) / (PUNE_CATCH.x1 - PUNE_CATCH.x0)) * GAUGE_SCALE; }
  /** Cell rainfall relative to CELL_REF (1 = fully green); renderer lerps ochre to green with a smoothstep. */
  cellRel(c: number): number { return this.sum(this.cellBins, c * WINDOW_SECONDS, (c + 1) * WINDOW_SECONDS) / CELL_REF; }
  cellGreen(c: number): number { return smoothstep(0.35, 0.85, this.cellRel(c)); }

  /** Opacity of the thin shower cloud over Pune (0 when there are no showers). */
  get showerCloud(): number { return clamp(this.bank / 4 + (this.showerAcc > 0 ? 0.2 : 0), 0, 1); }

  metrics(): Record<string, number> {
    const m = this.mumbaiGauge; const p = this.puneGauge;
    const hi = Math.max(m, p);
    return {
      mumbaiGauge: m, puneGauge: p, H: this.H, gaugeDiffRatio: hi > 0 ? Math.abs(m - p) / hi : 0,
      cloudPuffs: this.puffs.count, flat: this.flat ? 1 : 0, lastDescendingDropX: this.descendingDropMaxX,
    };
  }
}
