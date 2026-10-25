// SIM_EVAP. Two puddles, sun / wind / shade. Vapour wisps rise and fade; nothing sinks into the road.
import { BaseSim, Pool, type ControlSpec, type Controls } from './engine';
import { STEP } from './engine';
import type { SimId } from '../types';

/**
 * A base rate of 0.012 per second with these multipliers dries the sunny puddle at 24 s, but the
 * Watch script says "t16 sun puddle gone" and Lab c01_l1 needs it dry in under 10 s with sun and wind. 0.0184 meets all
 * three (sun 2 still: 16.0 s; sun 3 + breeze: 6.6 s).
 */
export const EVAP_BASE_RATE = 0.0184;
export const PUDDLE_A = { x0: 70, x1: 150 };
export const PUDDLE_B = { x0: 210, x1: 290 };
export const ROAD_Y = 392;

export class EvapSim extends BaseSim {
  readonly id: SimId = 'SIM_EVAP';
  readonly water = new Float32Array(2);            // 1 -> 0 for A, B
  readonly goneAt = new Float32Array(2);           // sim seconds when W hit 0 (0 = not yet)
  readonly wisps = new Pool(48);                   // a = age, b = life, c = which puddle; kind = 0
  private emitAcc = new Float32Array(2);

  constructor(seed: number, params: Record<string, number> = {}) { super(seed, params); this.reset(); }

  specs(): Record<string, ControlSpec> {
    return { sun: { kind: 'num', min: 0, max: 3, int: true }, wind: { kind: 'enum', values: ['still', 'breezy'] }, shade: { kind: 'bool' } };
  }
  protected defaults(): Controls { return { sun: 2, wind: 'still', shade: true }; }
  protected onReset(): void {
    this.water[0] = 1; this.water[1] = 1; this.goneAt[0] = 0; this.goneAt[1] = 0;
    this.wisps.clear(); this.emitAcc[0] = 0; this.emitAcc[1] = 0;
  }

  /** Per-second loss for puddle k (0 = A in the sun, 1 = B under the building). */
  rate(k: 0 | 1): number {
    const sun = this.num('sun');
    const sunHere = k === 0 ? sun : this.bool('shade') ? 0.25 * sun : sun;
    return EVAP_BASE_RATE * (1 + sunHere * 1.2) * (this.str('wind') === 'breezy' ? 1.8 : 1);
  }

  protected onStep(): void {
    for (let k = 0 as 0 | 1; k < 2; k = (k + 1) as 0 | 1) {
      if (this.water[k] > 0) {
        const loss = this.rate(k) * STEP;
        this.water[k] = Math.max(0, this.water[k] - loss);
        if (this.water[k] === 0 && this.goneAt[k] === 0) this.goneAt[k] = this.time;
        this.emitAcc[k] += loss * 190; // wisps proportional to loss
        const box = k === 0 ? PUDDLE_A : PUDDLE_B;
        while (this.emitAcc[k] >= 1) {
          this.emitAcc[k] -= 1;
          const i = this.wisps.alloc();
          if (i < 0) break;
          const half = ((box.x1 - box.x0) / 2) * Math.max(0.15, this.water[k]);
          this.wisps.x[i] = (box.x0 + box.x1) / 2 + (this.rng() * 2 - 1) * half;
          this.wisps.y[i] = ROAD_Y - 4;
          this.wisps.vy[i] = -(18 + this.rng() * 10);
          this.wisps.vx[i] = this.str('wind') === 'breezy' ? 26 + this.rng() * 10 : (this.rng() - 0.5) * 4;
          this.wisps.a[i] = 0; this.wisps.b[i] = 2.2 + this.rng() * 0.8; this.wisps.c[i] = k;
        }
      } else {
        this.emitAcc[k] = 0;
      }
    }
    const w = this.wisps;
    for (let i = 0; i < w.size; i++) {
      if (!w.active[i]) continue;
      w.a[i] += STEP;
      if (w.a[i] >= w.b[i]) { w.free(i); continue; }
      w.x[i] += w.vx[i] * STEP; w.y[i] += w.vy[i] * STEP;
    }
  }

  /** Drawn puddle half-width factor: ellipse width scales with W, min width 6 units, then vanishes. */
  puddleWidth(k: 0 | 1): number {
    const box = k === 0 ? PUDDLE_A : PUDDLE_B;
    const full = box.x1 - box.x0;
    if (this.water[k] <= 0) return 0;
    return Math.max(6, full * this.water[k]);
  }

  metrics(): Record<string, number> {
    return { puddleA: this.water[0], puddleB: this.water[1], puddleAGoneAt: this.goneAt[0], puddleBGoneAt: this.goneAt[1] };
  }
}
