// C08 Landform "sim": no particles, just the controls the 3D scene reads (sea level, camera preset, turn).
// Keeping it a Sim means the Watch script, Lab drawer and challenges work exactly like the 2D sims.
import { BaseSim, type ControlSpec, type Controls } from './engine';
import { SEA_MAX, SEA_MIN, buildHeightmap, landformState } from '../three/heightmap';
import type { SimId } from '../types';

export type CameraPreset = 'top' | 'angle' | 'side';
let heightmap: Float32Array | null = null;
export const getHeightmap = () => (heightmap ??= buildHeightmap());

export class LandformSim extends BaseSim {
  readonly id: SimId = '3D_LANDFORM';
  constructor(seed: number, params: Record<string, number> = {}) { super(seed, params); this.reset(); }
  specs(): Record<string, ControlSpec> {
    return {
      seaLevel: { kind: 'num', min: SEA_MIN, max: SEA_MAX },
      camera: { kind: 'enum', values: ['top', 'angle', 'side'] },
      turn: { kind: 'num', min: -35, max: 35 },
    };
  }
  protected defaults(): Controls { return { seaLevel: 0, camera: 'angle', turn: 0 }; }
  protected onReset(): void {}
  protected onStep(): void {}

  get seaLevel(): number { return this.num('seaLevel'); }
  get label(): 'Peninsula' | 'Island' { return landformState(getHeightmap(), this.seaLevel).label; }

  metrics(): Record<string, number> {
    const st = landformState(getHeightmap(), this.seaLevel);
    return { seaLevel: this.seaLevel, isIsland: st.label === 'Island' ? 1 : 0, islandJoined: st.islandJoined ? 1 : 0, neckFlooded: st.neckFlooded ? 1 : 0 };
  }
}
