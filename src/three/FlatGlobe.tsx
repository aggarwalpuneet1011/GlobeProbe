import React, { useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Pressable, View } from 'react-native';
import { EQUAL_EARTH_MAP } from '../ui/assets';
import { C } from '../ui/theme';
import { T } from '../ui/Text';
import { EQUAL_EARTH_ASPECT, equalEarthInverse, equalEarthUV } from './globeMath';
import type { Pin } from './GlobeView';

const SPACE = '#070D22';
const MAX_SCALE = 8;

/**
 * Plan C globe: the NASA Blue Marble re-projected to Equal Earth (never Mercator), in a pan/zoom view (1x to 8x) with small pins at their projected lat/lon.
 * Used only when the 3D globe cannot run on the phone.
 */
export function FlatGlobe({ size, pins, showPins, onPin, onTapLatLon }: {
  size: number; pins: Pin[]; showPins: boolean; onPin: (id: string) => void; onTapLatLon?: (lat: number, lon: number) => void;
}) {
  const W = size, H = size / EQUAL_EARTH_ASPECT, boxH = size;
  const [view, setView] = useState({ scale: 1, tx: 0, ty: (boxH - H) / 2 });
  const g = useRef({ x: 0, y: 0, d: 0, s0: 1, moved: 0, t0: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const clamp = (s: number, tx: number, ty: number) => {
    const w = W * s, h = H * s;
    return { scale: s, tx: w <= W ? 0 : Math.min(0, Math.max(W - w, tx)), ty: h <= boxH ? (boxH - h) / 2 : Math.min(0, Math.max(boxH - h, ty)) };
  };
  // Change zoom while keeping the middle of the view where it is.
  const zoomTo = (v: { scale: number; tx: number; ty: number }, s: number) => {
    const k = s / v.scale, cx = W / 2, cy = boxH / 2;
    return clamp(s, cx - (cx - v.tx) * k, cy - (cy - v.ty) * k);
  };
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => { g.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY, d: 0, s0: viewRef.current.scale, moved: 0, t0: Date.now() }; },
    onPanResponderMove: (e) => {
      const t = e.nativeEvent.touches;
      if (t.length >= 2) {
        const d = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
        if (!g.current.d) { g.current.d = d; g.current.s0 = viewRef.current.scale; }
        const s = Math.min(MAX_SCALE, Math.max(1, g.current.s0 * (d / g.current.d)));   // relative to where the pinch began, so it cannot compound
        setView((v) => zoomTo(v, s));
        g.current.moved = 99; g.current.x = e.nativeEvent.locationX; g.current.y = e.nativeEvent.locationY;
        return;
      }
      if (g.current.d) { g.current.d = 0; g.current.x = e.nativeEvent.locationX; g.current.y = e.nativeEvent.locationY; return; }   // one finger lifted: do not jump
      const dx = e.nativeEvent.locationX - g.current.x, dy = e.nativeEvent.locationY - g.current.y;
      g.current.x = e.nativeEvent.locationX; g.current.y = e.nativeEvent.locationY; g.current.moved += Math.abs(dx) + Math.abs(dy);
      setView((v) => clamp(v.scale, v.tx + dx, v.ty + dy));
    },
    onPanResponderRelease: (e) => {
      if (g.current.moved < 10 && Date.now() - g.current.t0 < 300) {
        const x = e.nativeEvent.locationX, y = e.nativeEvent.locationY;
        const v = viewRef.current;
        const ll = equalEarthInverse((x - v.tx) / (W * v.scale), (y - v.ty) / (H * v.scale));
        if (ll) onTapLatLon?.(ll.lat, ll.lon);
      }
    },
  }), [W, H, boxH, onTapLatLon]); // eslint-disable-line react-hooks/exhaustive-deps

  const btn = { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: 'rgba(5,10,28,0.62)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)' };
  return (
    <View accessible accessibilityLabel="A flat world map. Drag to move, pinch or use the plus and minus buttons to zoom." style={{ width: size, height: boxH, borderRadius: 24, overflow: 'hidden', borderWidth: 2, borderColor: C.ink, backgroundColor: SPACE }} {...pan.panHandlers}>
      <Image source={EQUAL_EARTH_MAP} resizeMode="stretch" style={{ position: 'absolute', left: view.tx, top: view.ty, width: W * view.scale, height: H * view.scale }} />
      {showPins ? pins.map((p) => {
        const { u, v } = equalEarthUV(p.lon, p.lat);
        return (
          <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Place ${p.name ?? p.id}`} onPress={() => onPin(p.id)} hitSlop={16}
            style={{ position: 'absolute', left: view.tx + u * W * view.scale - 7, top: view.ty + v * H * view.scale - 7, width: 14, height: 14, borderRadius: 7, backgroundColor: p.found ? '#7CE0A3' : C.coral, borderWidth: 2, borderColor: '#FFFFFF' }} />
        );
      }) : null}
      <View pointerEvents="box-none" style={{ position: 'absolute', right: 10, top: 10, gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" hitSlop={6} onPress={() => setView((v) => zoomTo(v, Math.min(MAX_SCALE, v.scale * 1.6)))} style={btn}><T v="h2" color="#FFFFFF" style={{ lineHeight: 26 }}>+</T></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" hitSlop={6} onPress={() => setView((v) => zoomTo(v, Math.max(1, v.scale / 1.6)))} style={btn}><T v="h2" color="#FFFFFF" style={{ lineHeight: 26 }}>−</T></Pressable>
      </View>
    </View>
  );
}
