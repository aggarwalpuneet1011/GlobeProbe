// SIM_RAIN. Hold on the cloud: the hold time sets the drop type; release starts 8 s of rain of that type.
import { BaseSim, Pool, STEP, type ControlSpec, type Controls } from './engine';
import type { SimId } from '../types';

export type RainType = 'none' | 'drizzle' | 'rain' | 'downpour';
export const RAIN_SECONDS = 8;
export const DRIZZLE_MAX_HOLD = 1.2;
export const RAIN_MAX_HOLD = 2.5;
export const GROUND_Y = 384;
export const CLOUD_BASE_Y = 140;
export const PUDDLE = { x0: 120, x1: 240 };
export const PUDDLE_CAP = 40000;
export const PUDDLE_DRAIN_PER_S = 0.02;

export const RAIN_TABLE = {
  drizzle: { w: 3, h: 4, speed: 110, perSec: 40, ripple: 6, sound: 'rain_drizzle' },
  rain: { w: 7, h: 10, speed: 360, perSec: 30, ripple: 16, sound: 'rain_steady' },
  downpour: { w: 10, h: 14, speed: 540, perSec: 70, ripple: 26, sound: 'rain_heavy' },
} as const;

/** Hold seconds -> rain type (< 1.2 s drizzle, 1.2 to 2.5 s rain, > 2.5 s downpour). */
export function typeForHold(sec: number): Exclude<RainType, 'none'> {
  return sec < DRIZZLE_MAX_HOLD ? 'drizzle' : sec <= RAIN_MAX_HOLD ? 'rain' : 'downpour';
}
/** Meter segments lit while holding: 1, 2 or 3. */
export const meterSegments = (sec: number) => (sec <= 0 ? 0 : sec < DRIZZLE_MAX_HOLD ? 1 : sec <= RAIN_MAX_HOLD ? 2 : 3);

export class RainSim extends BaseSim {
  readonly id: SimId = 'SIM_RAIN';
  holdTime = 0;
  type: RainType = 'none';
  rainLeft = 0;
  puddle = 0;                       // volume units, 0..PUDDLE_CAP * 2
  readonly drops = new Pool(260);   // a = type index 1..3 (size class); y falls
  readonly ripples = new Pool(32);  // a = age, b = max radius, c = life; kind = type index
  private emitAcc = 0;
  private wasPressed = false;
  private lastPressed = 0;

  constructor(seed: number, params: Record<string, number> = {}) { super(seed, params); this.reset(); }

  specs(): Record<string, ControlSpec> { return { press: { kind: 'bool' } }; }
  protected defaults(): Controls { return { press: false }; }
  protected onReset(): void {
    this.holdTime = 0; this.type = 'none'; this.rainLeft = 0; this.puddle = 0; this.emitAcc = 0;
    this.wasPressed = false; this.lastPressed = 0; this.drops.clear(); this.ripples.clear();
  }

  /** 0 closed (drizzle, or no rain), 1 open (rain, downpour). */
  get umbrellaOpen(): boolean { return this.rainLeft > 0 && this.type !== 'drizzle'; }
  get splashes(): boolean { return this.rainLeft > 0 && this.type === 'downpour'; }
  get segments(): number { return this.bool('press') ? meterSegments(this.holdTime) : 0; }

  protected onStep(): void {
    const pressed = this.bool('press');
    if (pressed) {
      this.holdTime += STEP;
    } else if (this.wasPressed) {
      // Release: start 8 s of the type this hold earned.
      this.type = typeForHold(this.lastPressed);
      this.rainLeft = RAIN_SECONDS;
      this.holdTime = 0;
    }
    if (pressed) this.lastPressed = this.holdTime;
    this.wasPressed = pressed;

    if (this.rainLeft > 0) {
      const t = RAIN_TABLE[this.type as Exclude<RainType, 'none'>];
      this.rainLeft = Math.max(0, this.rainLeft - STEP);
      this.emitAcc += t.perSec * STEP;
      const ti = this.type === 'drizzle' ? 1 : this.type === 'rain' ? 2 : 3;
      while (this.emitAcc >= 1) {
        this.emitAcc -= 1;
        const i = this.drops.alloc();
        if (i < 0) break;
        this.drops.x[i] = 100 + this.rng() * 160;
        this.drops.y[i] = CLOUD_BASE_Y; this.drops.vy[i] = t.speed; this.drops.a[i] = ti;
      }
      if (this.rainLeft === 0) this.emitAcc = 0;
    }

    const d = this.drops;
    for (let i = 0; i < d.size; i++) {
      if (!d.active[i]) continue;
      d.y[i] += d.vy[i] * STEP;
      if (d.y[i] >= GROUND_Y) {
        const ti = d.a[i];
        const x = d.x[i];
        d.free(i);
        if (x >= PUDDLE.x0 && x <= PUDDLE.x1) {
          const t = ti === 1 ? RAIN_TABLE.drizzle : ti === 2 ? RAIN_TABLE.rain : RAIN_TABLE.downpour;
          this.puddle = Math.min(PUDDLE_CAP * 2, this.puddle + t.w * t.h);
          const r = this.ripples.alloc();
          if (r >= 0) { this.ripples.x[r] = x; this.ripples.y[r] = GROUND_Y; this.ripples.a[r] = 0; this.ripples.b[r] = t.ripple; this.ripples.c[r] = 0.6; this.ripples.kind[r] = ti; }
        }
      }
    }
    const rp = this.ripples;
    for (let i = 0; i < rp.size; i++) {
      if (!rp.active[i]) continue;
      rp.a[i] += STEP;
      if (rp.a[i] >= rp.c[i]) rp.free(i);
    }
    this.puddle = Math.max(0, this.puddle - PUDDLE_CAP * PUDDLE_DRAIN_PER_S * STEP * (this.rainLeft > 0 ? 0.1 : 1));
  }

  metrics(): Record<string, number> {
    return {
      puddleLevel: this.puddle / PUDDLE_CAP,
      rainType: this.type === 'none' ? 0 : this.type === 'drizzle' ? 1 : this.type === 'rain' ? 2 : 3,
      holdTime: this.holdTime,
      raining: this.rainLeft > 0 ? 1 : 0,
    };
  }
}
