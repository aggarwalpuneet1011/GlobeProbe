import React, { useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Pressable, View } from 'react-native';
import { EQUAL_EARTH_MAP } from '../ui/assets';
import { C } from '../ui/theme';
import { EQUAL_EARTH_ASPECT, equalEarthInverse, equalEarthUV } from './globeMath';
import type { Pin } from './GlobeView';

/**
 * Plan C globe: the pre-rendered Equal Earth image in a pan/zoom view (1x to 3x), pins at their projected lat/lon.
 * Never Mercator. Used when GL fails twice on the device.
 */
export function FlatGlobe({ size, pins, showPins, onPin, onTapLatLon }: {
  size: number; pins: Pin[]; showPins: boolean; onPin: (id: string) => void; onTapLatLon?: (lat: number, lon: number) => void;
}) {
  const W = size, H = size / EQUAL_EARTH_ASPECT;
  const boxH = Math.min(size, Math.round(H * 1.9));
  const [view, setView] = useState({ scale: 1, tx: 0, ty: (boxH - H) / 2 });
  const g = useRef({ x: 0, y: 0, d: 0, s0: 1, moved: 0, t0: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const clamp = (s: number, tx: number, ty: number) => {
    const w = W * s, h = H * s;
    return { scale: s, tx: Math.min(0, Math.max(W - w, tx)), ty: h <= boxH ? (boxH - h) / 2 : Math.min(0, Math.max(boxH - h, ty)) };
  };
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => { g.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY, d: 0, s0: 1, moved: 0, t0: Date.now() }; },
    onPanResponderMove: (e) => {
      const t = e.nativeEvent.touches;
      if (t.length >= 2) {
        const d = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
        if (!g.current.d) g.current.d = d;
        setView((v) => { if (!g.current.s0 || g.current.s0 === 1) g.current.s0 = v.scale; const s = Math.min(3, Math.max(1, g.current.s0 * (d / g.current.d))); return clamp(s, v.tx, v.ty); });
        g.current.moved = 99; return;
      }
      g.current.d = 0; g.current.s0 = 0;
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

  return (
    <View accessible accessibilityLabel="A flat world map. Drag to move, pinch to zoom." style={{ width: size, height: boxH, borderRadius: 24, overflow: 'hidden', borderWidth: 2, borderColor: C.ink, backgroundColor: C.cream }} {...pan.panHandlers}>
      <Image source={EQUAL_EARTH_MAP} resizeMode="stretch" style={{ position: 'absolute', left: view.tx, top: view.ty, width: W * view.scale, height: H * view.scale }} />
      {showPins ? pins.map((p) => {
        const { u, v } = equalEarthUV(p.lon, p.lat);
        return (
          <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Place ${p.id}`} onPress={() => onPin(p.id)} hitSlop={14}
            style={{ position: 'absolute', left: view.tx + u * W * view.scale - 12, top: view.ty + v * H * view.scale - 12, width: 24, height: 24, borderRadius: 12, backgroundColor: p.found ? '#FFFFFF' : C.coral, borderWidth: 3, borderColor: C.coral }} />
        );
      }) : null}
    </View>
  );
}
