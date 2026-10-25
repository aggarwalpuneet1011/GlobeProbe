import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { Sim } from '../engine';
import type { Sim2D } from '../index';
import { Slider } from '../../ui/Slider';
import { Segmented } from '../../ui/Segmented';
import { ChunkyButton } from '../../ui/ChunkyButton';
import { T } from '../../ui/Text';
import { C } from '../../ui/theme';
import { fmtHours } from '../../util/time';
import { type Dir } from '../wind';

/** Re-reads sim.controls ~10 times a second so the strip follows script-driven changes. */
export function useControls(sim: Sim): Record<string, unknown> {
  const [snap, setSnap] = useState<Record<string, unknown>>({ ...sim.controls });
  useEffect(() => {
    let last = JSON.stringify(sim.controls);
    setSnap({ ...sim.controls });
    const id = setInterval(() => {
      const now = JSON.stringify(sim.controls);
      if (now !== last) { last = now; setSnap({ ...sim.controls }); }
    }, 100);
    return () => clearInterval(id);
  }, [sim]);
  return snap;
}

/** Control strip below the canvas: inset 32 dp from the screen edges (clear of the Android back-swipe zone); chunky sliders and segmented pills. */
export function SimControls({ simId, sim, enabled = true, onUserControl }: { simId: Sim2D; sim: Sim; enabled?: boolean; onUserControl?: () => void }) {
  const c = useControls(sim);
  const set = (id: string, v: number | string | boolean) => { onUserControl?.(); sim.setControl(id, v); };
  const wrap = (children: React.ReactNode) => (
    <View style={{ minHeight: 88, paddingHorizontal: 32, justifyContent: 'center', gap: 6, opacity: enabled ? 1 : 0.5 }} pointerEvents={enabled ? 'auto' : 'none'}>{children}</View>
  );
  switch (simId) {
    case 'SIM_EVAP':
      return wrap(<>
        <Slider label="Sun strength" value={c.sun as number} min={0} max={3} step={1} icon="sunny" onChange={(v) => set('sun', v)} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Segmented label="Wind" value={c.wind as string} options={[{ id: 'still', label: 'Still' }, { id: 'breezy', label: 'Breezy' }]} onChange={(v) => set('wind', v)} /></View>
          <View style={{ flex: 1 }}><Segmented label="Shade on puddle B" value={c.shade ? 'on' : 'off'} options={[{ id: 'on', label: 'Shade on' }, { id: 'off', label: 'Shade off' }]} onChange={(v) => set('shade', v === 'on')} /></View>
        </View>
      </>);
    case 'SIM_CLOUD':
      return wrap(<>
        <T v="label" color={C.ink2}>Drag the big air bubble up and down. The sun makes small bubbles rise.</T>
        <Slider label="Sun strength" value={c.sun as number} min={0} max={3} step={1} icon="sunny" onChange={(v) => set('sun', v)} />
      </>);
    case 'SIM_RAIN':
      return wrap(<T v="body" center>Press and hold the cloud. Let go to make it rain.</T>);
    case 'SIM_WIND':
      return wrap(<>
        <T v="label" color={C.ink2} center>Tap where the wind comes FROM, or drag the arrow's head.</T>
        {([['N', 'NE', 'E', 'SE'], ['S', 'SW', 'W', 'NW']] as Dir[][]).map((row) => (
          <Segmented key={row[0]} label="Wind from" value={(row.includes(c.windFrom as Dir) ? c.windFrom : '') as Dir} options={row.map((d) => ({ id: d, label: d }))} onChange={(v) => set('windFrom', v)} />
        ))}
      </>);
    case 'SIM_BREEZE':
      return wrap(<>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}><Slider label="Time of day" value={c.time as number} min={6} max={30} step={0.5} icon="day_night" onChange={(v) => set('time', v)} /></View>
          <View style={{ width: 96 }}><ChunkyButton small label={c.playing ? 'Pause' : 'Play'} kind="secondary" onPress={() => set('playing', !c.playing)} /></View>
        </View>
        <T v="label" color={C.ink2} center>{fmtHours(c.time as number)}</T>
      </>);
    case 'SIM_MOUNTAIN':
      return wrap(<>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}><Slider label="Mountain height" value={c.H as number} min={0} max={220} step={5} icon="mountain" onChange={(v) => set('H', v)} /></View>
          <View style={{ width: 104 }}><ChunkyButton small label="Remove" kind="ghost" onPress={() => set('H', 0)} /></View>
        </View>
        <Segmented label="Wind" value={c.wind as string} options={[{ id: 'sea', label: 'From sea (W)' }, { id: 'off', label: 'Off' }, { id: 'land', label: 'From land (E)' }]} onChange={(v) => set('wind', v)} />
      </>);
    case 'SIM_TIDE':
      return wrap(<>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}><Slider label="Time over two days" value={c.time as number} min={0} max={48} step={0.5} icon="tide" onChange={(v) => set('time', v)} /></View>
          <View style={{ width: 96 }}><ChunkyButton small label={c.playing ? 'Pause' : 'Play'} kind="secondary" onPress={() => set('playing', !c.playing)} /></View>
        </View>
      </>);
  }
}
