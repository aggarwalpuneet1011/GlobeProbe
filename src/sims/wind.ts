// SIM_WIND. The arrow shows where the air moves; every label says where it comes FROM.
import { BaseSim, type ControlSpec, type Controls } from './engine';
import { STEP } from './engine';
import type { SimId } from '../types';

export const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type Dir = (typeof DIRS)[number];
export const DIR_WORDS: Record<Dir, string> = {
  N: 'north', NE: 'north-east', E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west',
};

export const opposite = (d: Dir): Dir => DIRS[(DIRS.indexOf(d) + 4) % 8];
/** Compass bearing (0 = north, clockwise) the air moves TOWARD when it blows from `d`. */
export const bearingToward = (from: Dir): number => (DIRS.indexOf(from) * 45 + 180) % 360;
export const bearingFrom = (from: Dir): number => DIRS.indexOf(from) * 45;

/** The label under the arrow, always with "from". */
export const windLabel = (from: Dir) => `Wind from the ${DIR_WORDS[from]} (${from})`;

/** Map the arrow head's bearing (where it points) to the wind-from direction, snapping to 8 directions. */
export function windFromArrow(towardBearingDeg: number): Dir {
  const snapped = Math.round((((towardBearingDeg % 360) + 360) % 360) / 45) % 8;
  return opposite(DIRS[snapped]);
}

/** Wind game: "Make a north-east wind". Correct = wind FROM the target (arrow points the other way). */
export function windGame(target: Dir, windFrom: Dir): 'correct' | 'wentTo' | 'wrong' {
  if (windFrom === target) return 'correct';
  if (windFrom === opposite(target)) return 'wentTo';
  return 'wrong';
}

/** East side of the map is land at Marine Drive, so winds from NE, E or SE come off the land and blow out to sea. */
export const isFromLand = (d: Dir) => d === 'NE' || d === 'E' || d === 'SE';

export class WindSim extends BaseSim {
  readonly id: SimId = 'SIM_WIND';
  /** Smoothed arrow bearing (toward), degrees, for animation. */
  arrow = 90;
  phase = 0;

  constructor(seed: number, params: Record<string, number> = {}) { super(seed, params); this.reset(); }

  specs(): Record<string, ControlSpec> { return { windFrom: { kind: 'enum', values: DIRS } }; }
  protected defaults(): Controls { return { windFrom: 'W' }; }
  protected onReset(): void { this.arrow = bearingToward('W'); this.phase = 0; }
  get from(): Dir { return this.str('windFrom') as Dir; }

  protected onStep(): void {
    this.phase += STEP;
    const target = bearingToward(this.from);
    let d = ((target - this.arrow + 540) % 360) - 180;
    const max = 360 * STEP; // 360 deg/s
    if (Math.abs(d) < max) this.arrow = target; else this.arrow += Math.sign(d) * max;
    this.arrow = (this.arrow + 360) % 360;
  }

  metrics(): Record<string, number> {
    const f = this.from;
    return { windFromLand: isFromLand(f) ? 1 : 0, windFromSW: f === 'SW' ? 1 : 0, windFromIndex: DIRS.indexOf(f), arrow: this.arrow };
  }
}
