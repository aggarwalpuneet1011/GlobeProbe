import React, { useRef, useState } from 'react';
import { PanResponder, View, type LayoutChangeEvent } from 'react-native';
import { C } from './theme';
import { Icon } from './Icon';
import { hapticTick } from './haptics';

/** Stepped slider: 28 dp track, 44 dp paper thumb with an icon, haptic tick at each step. */
export function Slider({ value, min, max, step = 1, onChange, icon, label, onStart, onEnd }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void; icon: string; label: string; onStart?: () => void; onEnd?: () => void;
}) {
  const [w, setW] = useState(0);
  const wRef = useRef(0);
  const last = useRef(value);
  const cfg = useRef({ min, max, step, onChange, onStart, onEnd });
  cfg.current = { min, max, step, onChange, onStart, onEnd };
  const THUMB = 44;

  const valueAt = (x: number) => {
    const { min: lo, max: hi, step: st } = cfg.current;
    const span = Math.max(1, wRef.current - THUMB);
    const t = Math.max(0, Math.min(1, (x - THUMB / 2) / span));
    const raw = lo + t * (hi - lo);
    return Math.max(lo, Math.min(hi, Math.round(raw / st) * st));
  };
  const apply = (x: number) => {
    const v = valueAt(x);
    if (v !== last.current) { last.current = v; hapticTick(); cfg.current.onChange(v); }
  };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => { cfg.current.onStart?.(); apply(e.nativeEvent.locationX); },
    onPanResponderMove: (e) => apply(e.nativeEvent.locationX),
    onPanResponderRelease: () => cfg.current.onEnd?.(),
    onPanResponderTerminate: () => cfg.current.onEnd?.(),
  })).current;

  last.current = value;
  const t = (value - min) / Math.max(1e-9, max - min);
  const x = THUMB / 2 + t * Math.max(0, w - THUMB);
  const onLayout = (e: LayoutChangeEvent) => { wRef.current = e.nativeEvent.layout.width; setW(wRef.current); };
  return (
    <View onLayout={onLayout} {...pan.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const dir = e.nativeEvent.actionName === 'increment' ? 1 : -1;
        const v = Math.max(min, Math.min(max, value + dir * step));
        if (v !== value) cfg.current.onChange(v);
      }}
      style={{ height: 56, justifyContent: 'center' }}>
      <View style={{ height: 28, borderRadius: 14, borderWidth: 2, borderColor: C.ink, backgroundColor: C.cream, overflow: 'hidden' }}>
        <View style={{ width: x, height: '100%', backgroundColor: C.sea }} />
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', left: x - THUMB / 2, top: 6, width: THUMB, height: THUMB, borderRadius: THUMB / 2, borderWidth: 2, borderColor: C.ink, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={26} />
      </View>
    </View>
  );
}
