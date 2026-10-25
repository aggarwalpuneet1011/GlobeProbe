// 2D sim engine: fixed 30 Hz step, seeded RNG, pooled particles, scripted runs.
// Pure TypeScript with no Skia/React imports so everything here runs under node tests.
import type { ControlValue, ScriptStep, SimId } from '../types';
import { clamp, lerp, mulberry32, type Rng } from '../util/rng';

export const STEP = 1 / 30;
export const WORLD_W = 360;
export const WORLD_H = 480;
export const MAX_STEPS_PER_TICK = 12;

export type Controls = Record<string, ControlValue>;
export type ControlSpec =
  | { kind: 'num'; min: number; max: number; int?: boolean }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'bool' };

export interface Sim {
  readonly id: SimId;
  time: number;
  controls: Controls;
  reset(): void;
  setControl(id: string, v: ControlValue): void;
  step(): void;
  metrics(): Record<string, number>;
  specs(): Record<string, ControlSpec>;
}

export abstract class BaseSim implements Sim {
  abstract readonly id: SimId;
  time = 0;
  controls: Controls = {};
  protected rng: Rng = mulberry32(1);
  protected seed: number;
  protected params: Record<string, number>;

  constructor(seed: number, params: Record<string, number> = {}) {
    this.seed = seed;
    this.params = params;
  }

  abstract specs(): Record<string, ControlSpec>;
  protected abstract defaults(): Controls;
  protected abstract onReset(): void;
  protected abstract onStep(): void;
  protected onControl(_id: string): void {}
  abstract metrics(): Record<string, number>;

  reset(): void {
    this.time = 0;
    this.rng = mulberry32(this.seed);
    this.controls = this.defaults();
    this.onReset();
  }

  setControl(id: string, v: ControlValue): void {
    const spec = this.specs()[id];
    if (!spec) return;
    let nv: ControlValue = v;
    if (spec.kind === 'num') {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) return;
      nv = clamp(spec.int ? Math.round(n) : n, spec.min, spec.max);
    } else if (spec.kind === 'enum') {
      if (typeof v !== 'string' || !spec.values.includes(v)) return;
    } else {
      nv = !!v;
    }
    this.controls[id] = nv;
    this.onControl(id);
  }

  step(): void {
    this.time += STEP;
    this.onStep();
  }

  protected num(id: string): number { return this.controls[id] as number; }
  protected str(id: string): string { return this.controls[id] as string; }
  protected bool(id: string): boolean { return !!this.controls[id]; }
}

/** Fixed-size particle pool. No allocation after construction. */
export class Pool {
  readonly size: number;
  readonly active: Uint8Array;
  readonly x: Float32Array; readonly y: Float32Array; readonly vx: Float32Array; readonly vy: Float32Array;
  readonly a: Float32Array; readonly b: Float32Array; readonly c: Float32Array;
  readonly kind: Uint8Array;
  count = 0;
  constructor(size: number) {
    this.size = size;
    this.active = new Uint8Array(size);
    this.x = new Float32Array(size); this.y = new Float32Array(size);
    this.vx = new Float32Array(size); this.vy = new Float32Array(size);
    this.a = new Float32Array(size); this.b = new Float32Array(size); this.c = new Float32Array(size);
    this.kind = new Uint8Array(size);
  }
  alloc(): number {
    for (let i = 0; i < this.size; i++) {
      if (!this.active[i]) {
        this.active[i] = 1; this.count++;
        this.x[i] = 0; this.y[i] = 0; this.vx[i] = 0; this.vy[i] = 0; this.a[i] = 0; this.b[i] = 0; this.c[i] = 0; this.kind[i] = 0;
        return i;
      }
    }
    return -1;
  }
  free(i: number): void {
    if (this.active[i]) { this.active[i] = 0; this.count--; }
  }
  clear(): void { this.active.fill(0); this.count = 0; }
}

/** Plays Watch-step scripts: {t,set,ease?}, {t,caption}, {t,hold}. */
export class ScriptRunner {
  private idx = 0;
  private eases: { id: string; from: number; to: number; t0: number; dur: number }[] = [];
  private releases: number[] = [];
  private readonly steps: ScriptStep[];
  constructor(script: ScriptStep[], private sim: Sim, private onCaption?: (captionId: string) => void) {
    this.steps = script.slice().sort((a, b) => a.t - b.t);
  }
  reset(): void { this.idx = 0; this.eases = []; this.releases = []; }

  update(t: number): void {
    while (this.idx < this.steps.length && this.steps[this.idx].t <= t + 1e-9) this.apply(this.steps[this.idx++]);
    for (let i = this.eases.length - 1; i >= 0; i--) {
      const e = this.eases[i];
      const k = e.dur <= 0 ? 1 : clamp((t - e.t0) / e.dur, 0, 1);
      this.sim.setControl(e.id, lerp(e.from, e.to, k * k * (3 - 2 * k)));
      if (k >= 1) this.eases.splice(i, 1);
    }
    for (let i = this.releases.length - 1; i >= 0; i--) {
      if (t >= this.releases[i] - 1e-9) { this.sim.setControl('press', false); this.releases.splice(i, 1); }
    }
  }

  private apply(s: ScriptStep): void {
    if ('caption' in s) { this.onCaption?.(s.caption); return; }
    if ('hold' in s) { this.sim.setControl('press', true); this.releases.push(s.t + s.hold); return; }
    const ease = s.ease ?? 0;
    for (const [id, v] of Object.entries(s.set)) {
      const cur = this.sim.controls[id];
      this.eases = this.eases.filter((e) => e.id !== id);
      if (ease > 0 && typeof v === 'number' && typeof cur === 'number') this.eases.push({ id, from: cur, to: v, t0: s.t, dur: ease });
      else this.sim.setControl(id, v);
    }
  }
}

/** Real-time driver: accumulates frame time into fixed steps; 2x speed doubles the step rate. */
export class SimSession {
  speed: 1 | 2 = 1;
  playing = false;
  scriptDone = false;
  private acc = 0;
  private runner: ScriptRunner | null;
  constructor(public sim: Sim, private script: ScriptStep[] | null, private scriptDuration = 0, private onCaption?: (id: string) => void) {
    this.runner = script ? new ScriptRunner(script, sim, onCaption) : null;
    sim.reset();
  }
  /** Fresh script runner and cleared manual flag (after replay, restore or seek). */
  private rearm(): void {
    this.manual = false;
    if (this.script && !this.runner) this.runner = new ScriptRunner(this.script, this.sim, this.onCaption);
    else this.runner?.reset();
  }
  /** True once the child has grabbed a control during the scripted run. */
  manual = false;
  play(): void { this.playing = true; }
  pause(): void { this.playing = false; }
  /** The child touched a control mid-script: stop the script from overwriting her, keep the sim running, count the run as watched. */
  takeOver(): void {
    if (this.manual) return;
    this.manual = true; this.runner = null; this.scriptDone = true; this.playing = true;
  }
  replay(): void {
    this.sim.reset(); this.rearm(); this.acc = 0; this.scriptDone = false; this.playing = true;
  }
  /** Silent fast-forward to script time `t` (highlight replay). Leaves the session playing. */
  seekTo(t: number): void {
    this.sim.reset(); this.rearm(); this.acc = 0; this.scriptDone = false;
    const guard = Math.ceil(t / STEP) + 2;
    for (let i = 0; i < guard && this.sim.time + STEP / 2 < t; i++) this.stepOnce();
    this.playing = true;
  }
  /** Back to defaults, paused (Lab reset button). */
  restore(): void { this.sim.reset(); this.rearm(); this.acc = 0; this.scriptDone = false; this.playing = false; }
  /** Advance by real seconds. Returns the number of fixed steps run. */
  tick(dt: number): number {
    if (!this.playing) return 0;
    this.acc += Math.min(dt, 0.25) * this.speed;
    let n = Math.floor(this.acc / STEP);
    if (n > MAX_STEPS_PER_TICK) n = MAX_STEPS_PER_TICK;
    this.acc -= Math.floor(this.acc / STEP) * STEP;
    for (let i = 0; i < n; i++) this.stepOnce();
    return n;
  }
  stepOnce(): void {
    this.runner?.update(this.sim.time);
    this.sim.step();
    if (this.runner && !this.scriptDone && this.sim.time >= this.scriptDuration) this.scriptDone = true;
  }
}

/** Test/helper: run a sim for `seconds` of sim time, optionally with a script. */
export function runSim(sim: Sim, seconds: number, script?: ScriptStep[], onCaption?: (id: string) => void): void {
  const runner = script ? new ScriptRunner(script, sim, onCaption) : null;
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i++) { runner?.update(sim.time); sim.step(); }
}

export const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Colour helpers for parcel temperature. */
export const WARM = '#F28C38';
export const COOL = '#9CCBEF';
export function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function lerpColor(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a); const [r2, g2, b2] = hexToRgb(b);
  const k = clamp(t, 0, 1);
  const c = (x: number, y: number) => Math.round(x + (y - x) * k).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}
export const parcelColor = (coolness: number) => lerpColor(WARM, COOL, coolness);
