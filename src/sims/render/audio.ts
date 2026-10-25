// Ambient sound for sims: rain by type, mountain rain volume follows the drop rate, waves for tide, soft wind for wind and breeze.
import { useEffect } from 'react';
import type { Sim } from '../engine';
import type { Sim2D } from '../index';
import { setLoopVolume, startLoop, stopAllLoops, stopLoop } from '../../ui/sfx';
import type { SoundId } from '../../ui/assets';
import { MountainSim } from '../mountain';
import type { RainSim } from '../rain';
import type { BreezeSim } from '../breeze';

const RAIN_LOOPS: SoundId[] = ['rain_drizzle', 'rain_steady', 'rain_heavy'];

export function useSimAudio(simId: Sim2D, sim: Sim, enabled: boolean) {
  useEffect(() => {
    if (!enabled) { stopAllLoops(); return; }
    const id = setInterval(() => {
      if (simId === 'SIM_RAIN') {
        const r = sim as RainSim;
        const want: SoundId | null = r.rainLeft > 0 ? (r.type === 'drizzle' ? 'rain_drizzle' : r.type === 'rain' ? 'rain_steady' : 'rain_heavy') : null;
        for (const s of RAIN_LOOPS) { if (s === want) startLoop(s, 0.9); else stopLoop(s); }
      } else if (simId === 'SIM_MOUNTAIN') {
        const m = sim as MountainSim;
        const v = Math.min(1, m.drops.count / 40);
        if (v > 0.03) { startLoop('rain_steady', v); setLoopVolume('rain_steady', v); } else stopLoop('rain_steady');
      } else if (simId === 'SIM_TIDE') {
        if (sim.controls.playing) startLoop('waves', 0.5); else stopLoop('waves');
      } else if (simId === 'SIM_WIND') {
        startLoop('wind_soft', 0.35);
      } else if (simId === 'SIM_BREEZE') {
        const b = sim as BreezeSim;
        if (b.mode !== 'calm') startLoop('wind_soft', 0.2 + 0.4 * (b.parcelSpeed - 20) / 40); else stopLoop('wind_soft');
      }
    }, 250);
    return () => { clearInterval(id); stopAllLoops(); };
  }, [simId, sim, enabled]);
}
