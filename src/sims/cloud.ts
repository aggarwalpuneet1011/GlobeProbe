// SIM_CLOUD. Cooling is the cause: colour + thermometer change first, then the cloud forms above the cloud line.
import { BaseSim, Pool, STEP, type ControlSpec, type Controls } from './engine';
import { clamp, lerp } from '../util/rng';
import type { SimId } from '../types';

export const CLOUD_LINE_Y = 200;
export const SEA_Y = 400;
export const TOP_Y = 60;
export const BIG_R = 22;
export const BIG_X = 180;
export const PUFF_MAX = 26;
export const PUFF_SECONDS = 1.2;
export const SMALL_PUFF_MAX = 14;
const SPAWN_EVERY = [Infinity, 2.4, 1.2, 0.6];
const RISE_SPEED = 38;

/** Coolness 0 (warm, at the sea) to 1 (cool, at the top) for a world y. */
export const coolnessAt = (y: number) => clamp((SEA_Y - y) / (SEA_Y - TOP_Y), 0, 1);
/** Thermometer reading in degrees C for a world y. */
export const tempAt = (y: number) => lerp(30, 6, coolnessAt(y));

export class CloudSim extends BaseSim {
  readonly id: SimId = 'SIM_CLOUD';
  bigPuff = 0;                       // radius 0..26
  bigMoisture = 1;
  readonly small = new Pool(40);     // a = puff radius, b = moisture, y rises; kind unused
  private spawnT = 0;

  constructor(seed: number, params: Record<string, number> = {}) { super(seed, params); this.reset(); }

  specs(): Record<string, ControlSpec> {
    return { parcelY: { kind: 'num', min: TOP_Y + BIG_R, max: SEA_Y - BIG_R + 6 }, sun: { kind: 'num', min: 0, max: 3, int: true } };
  }
  protected defaults(): Controls { return { parcelY: 385, sun: 2 }; }
  protected onReset(): void { this.bigPuff = 0; this.bigMoisture = 1; this.small.clear(); this.spawnT = 0; }

  protected onStep(): void {
    // Big parcel: puff grows 0 -> 26 over 1.2 s above the line (with moisture), shrinks to nothing in 1.2 s below it.
    const above = this.num('parcelY') < CLOUD_LINE_Y && this.bigMoisture > 0.3;
    const d = (PUFF_MAX / PUFF_SECONDS) * STEP;
    this.bigPuff = clamp(this.bigPuff + (above ? d : -d), 0, PUFF_MAX);

    // Small parcels rise on their own with the sun.
    const every = SPAWN_EVERY[this.num('sun')];
    this.spawnT += STEP;
    if (this.spawnT >= every) {
      this.spawnT = 0;
      const i = this.small.alloc();
      if (i >= 0) {
        let x = 40 + this.rng() * 280;
        if (Math.abs(x - BIG_X) < 50) x = x < BIG_X ? BIG_X - 50 : BIG_X + 50;
        this.small.x[i] = clamp(x, 30, 330); this.small.y[i] = SEA_Y - 8; this.small.b[i] = 1; this.small.a[i] = 0;
      }
    }
    const s = this.small;
    for (let i = 0; i < s.size; i++) {
      if (!s.active[i]) continue;
      s.y[i] -= RISE_SPEED * STEP;
      const up = s.y[i] < CLOUD_LINE_Y && s.b[i] > 0.3;
      const dd = (SMALL_PUFF_MAX / PUFF_SECONDS) * STEP;
      s.a[i] = clamp(s.a[i] + (up ? dd : -dd), 0, SMALL_PUFF_MAX);
      if (s.y[i] < TOP_Y) s.free(i);
    }
  }

  metrics(): Record<string, number> {
    const y = this.num('parcelY');
    return { cloudSize: this.bigPuff, parcelAboveLine: CLOUD_LINE_Y - y, parcelY: y, coolness: coolnessAt(y), temp: tempAt(y) };
  }
}
