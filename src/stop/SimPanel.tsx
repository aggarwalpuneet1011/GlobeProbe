import React, { useMemo } from 'react';
import { View } from 'react-native';
import type { Concept } from '../types';
import type { SimSession } from '../sims/engine';
import type { Sim2D } from '../sims';
import { SimView } from '../sims/render/SimView';
import { RENDER_KITS } from '../sims/render';
import { SimControls, useControls } from '../sims/render/Controls';
import { LandformPanel } from '../three/LandformPanel';
import { SEA_MAX, SEA_MIN } from '../three/heightmap';
import { Slider } from '../ui/Slider';
import { Segmented } from '../ui/Segmented';
import { T } from '../ui/Text';
import { C } from '../ui/theme';
import { usePrefs } from '../ui/prefs';

function LandformControls({ session, enabled, onUserControl }: { session: SimSession; enabled: boolean; onUserControl?: () => void }) {
  const c = useControls(session.sim);
  const set = (id: string, v: number | string) => { onUserControl?.(); session.sim.setControl(id, v); };
  return (
    <View style={{ minHeight: 88, paddingHorizontal: 24, justifyContent: 'center', gap: 6, opacity: enabled ? 1 : 0.5 }} pointerEvents={enabled ? 'auto' : 'none'}>
      <Slider label="Sea level" value={c.seaLevel as number} min={SEA_MIN} max={SEA_MAX} step={0.01} icon="tide" onChange={(v) => set('seaLevel', v)} />
      <Segmented label="Camera" value={c.camera as string} options={[{ id: 'top', label: 'Top' }, { id: 'angle', label: 'Angle' }, { id: 'side', label: 'Side' }]} onChange={(v) => set('camera', v)} />
    </View>
  );
}

/**
 * The picture of the sim plus its controls. `enabled` switches the controls and direct manipulation on or off
 * (off while she is still predicting or the scripted run is playing).
 */
export function SimPanel({ concept, session, width, enabled, controls = true, highlight = null, flags, caption, controlsLive, onUserControl }: {
  concept: Concept; session: SimSession; width: number; enabled: boolean; controls?: boolean; highlight?: string | null;
  flags?: Record<string, boolean | number | string>; caption?: string;
  /** Keep the control strip usable even while `enabled` is false (Watch step: the child may grab a control mid-run, which hands her the sim). */
  controlsLive?: boolean; onUserControl?: () => void;
}) {
  const { reduceMotion } = usePrefs();
  const id = concept.sim;
  const kit = id === '3D_LANDFORM' ? null : RENDER_KITS[id as Sim2D];
  const interaction = useMemo(() => (kit?.interaction && enabled ? kit.interaction(session.sim) : null), [kit, enabled, session]);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ alignItems: 'center' }}>
        {kit ? (
          <SimView session={session} render={kit.render} bounds={kit.bounds} summary={kit.summary} highlight={highlight} width={width} interaction={interaction} reduceMotion={reduceMotion} flags={flags} />
        ) : (
          <LandformPanel session={session} width={width} highlight={highlight} interactive={enabled} />
        )}
      </View>
      {caption ? <T v="label" color={C.ink2} center>{caption}</T> : null}
      {controls ? (kit ? <SimControls simId={id as Sim2D} sim={session.sim} enabled={enabled || !!controlsLive} onUserControl={onUserControl} /> : <LandformControls session={session} enabled={enabled || !!controlsLive} onUserControl={onUserControl} />) : null}
    </View>
  );
}
