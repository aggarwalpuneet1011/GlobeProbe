import type { Concept, SimId } from '../types';
import { BaseSim, type Sim } from './engine';
import { EvapSim } from './evap';
import { CloudSim } from './cloud';
import { RainSim } from './rain';
import { WindSim } from './wind';
import { BreezeSim } from './breeze';
import { MountainSim } from './mountain';
import { TideSim } from './tide';
import { LandformSim } from './landform';

export * from './engine';

export type Sim2D = Exclude<SimId, '3D_LANDFORM'>;

export function createSim(id: Sim2D, seed: number, params: Record<string, number> = {}): Sim {
  switch (id) {
    case 'SIM_EVAP': return new EvapSim(seed, params);
    case 'SIM_CLOUD': return new CloudSim(seed, params);
    case 'SIM_RAIN': return new RainSim(seed, params);
    case 'SIM_WIND': return new WindSim(seed, params);
    case 'SIM_BREEZE': return new BreezeSim(seed, params);
    case 'SIM_MOUNTAIN': return new MountainSim(seed, params);
    case 'SIM_TIDE': return new TideSim(seed, params);
  }
}

export const createSimFor = (c: Concept): Sim => (c.sim === '3D_LANDFORM' ? new LandformSim(c.seed, c.simParams) : createSim(c.sim, c.seed, c.simParams));
export type { BaseSim };
