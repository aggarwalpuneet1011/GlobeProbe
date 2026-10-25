import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import { Canvas, Group, Picture, Skia, useFont, type SkCanvas, type SkFont, type SkPicture } from '@shopify/react-native-skia';
import type { Sim, SimSession } from '../engine';
import { alphaLayer, R, strokePaint, W, H } from './kit';
import { C } from '../../ui/theme';

export interface RenderEnv {
  font: SkFont | null;
  t: number;
  highlight: string | null;
  reduceMotion: boolean;
  /** Draw `fn` as a named layer: dimmed to 35% when a different layer is highlighted. */
  layer: (c: SkCanvas, name: string, fn: () => void) => void;
  /** Labels shown once per run, e.g. "vapour (really invisible)". */
  once: (key: string) => boolean;
  /** Extra display hints from the screen, e.g. glowTail for the wind game. */
  flags: Record<string, boolean | number | string>;
}
export type Renderer<S extends Sim = Sim> = (c: SkCanvas, sim: S, env: RenderEnv) => void;
export type Bounds<S extends Sim = Sim> = (sim: S, layer: string) => [number, number, number, number] | null;

export interface Interaction {
  /** Return true if a touch at world (x, y) should start a drag. */
  hit: (x: number, y: number) => boolean;
  start?: (x: number, y: number) => void;
  move: (x: number, y: number) => void;
  end?: () => void;
}

const nunito = require('@expo-google-fonts/nunito/700Bold/Nunito_700Bold.ttf');

/**
 * Renders a sim with Skia. Each frame: advance the session by real time, record the world into a Picture, show it.
 * World is 360 x 480 units scaled uniformly to the width (aspect fixed 3:4).
 */
export function SimView<S extends Sim>({ session, render, bounds, highlight = null, width, interaction, reduceMotion = false, summary, flags }: {
  session: SimSession; render: Renderer<S>; bounds?: Bounds<S>; highlight?: string | null; width: number;
  interaction?: Interaction | null; reduceMotion?: boolean; summary?: (sim: S) => string; flags?: Record<string, boolean | number | string>;
}) {
  const flagsRef = useRef<Record<string, boolean | number | string>>(flags ?? {});
  flagsRef.current = flags ?? {};
  const font = useFont(nunito, 13);
  const [pic, setPic] = useState<SkPicture | null>(null);
  const [a11y, setA11y] = useState('');
  const seen = useRef<Set<string>>(new Set());
  const hl = useRef<string | null>(highlight);
  hl.current = highlight;
  const fontRef = useRef<SkFont | null>(null);
  fontRef.current = font;
  const scale = width / W;
  const height = (width * H) / W;
  const interactionRef = useRef<Interaction | null | undefined>(interaction);
  interactionRef.current = interaction;

  useEffect(() => {
    let raf = 0;
    let last = 0;
    let n = 0;
    const frame = (now: number) => {
      const dt = last ? (now - last) / 1000 : 0;
      last = now;
      session.tick(dt);
      const sim = session.sim as S;
      const rec = Skia.PictureRecorder();
      const c = rec.beginRecording(R(0, 0, W, H));
      const h = hl.current;
      const env: RenderEnv = {
        font: fontRef.current, t: sim.time, highlight: h, reduceMotion,
        layer: (cv, name, fn) => {
          if (!h || h === name) fn();
          else { cv.saveLayer(alphaLayer(0.35)); fn(); cv.restore(); }
        },
        once: (key) => { if (seen.current.has(key)) return false; seen.current.add(key); return true; },
        flags: flagsRef.current,
      };
      render(c, sim, env);
      if (h && bounds) {
        const b = bounds(sim, h);
        if (b) c.drawRRect(Skia.RRectXY(R(b[0], b[1], b[2], b[3]), 8, 8), strokePaint(C.coral, 2, 1, [6, 4]));
      }
      setPic(rec.finishRecordingAsPicture());
      if (summary && n++ % 15 === 0) setA11y(summary(sim));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [session, render, bounds, reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: (e) => {
      const it = interactionRef.current;
      if (!it) return false;
      return it.hit(e.nativeEvent.locationX / scale, e.nativeEvent.locationY / scale);
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => interactionRef.current?.start?.(e.nativeEvent.locationX / scale, e.nativeEvent.locationY / scale),
    onPanResponderMove: (e) => interactionRef.current?.move(e.nativeEvent.locationX / scale, e.nativeEvent.locationY / scale),
    onPanResponderRelease: () => interactionRef.current?.end?.(),
    onPanResponderTerminate: () => interactionRef.current?.end?.(),
  }), [scale]);

  return (
    <View accessible accessibilityLabel={a11y || 'Simulation'} style={{ width, height, borderRadius: 20, overflow: 'hidden', borderWidth: 2, borderColor: C.ink, backgroundColor: C.sky }} {...pan.panHandlers}>
      <Canvas style={{ width, height }} pointerEvents="none">
        <Group transform={[{ scale }]}>{pic ? <Picture picture={pic} /> : null}</Group>
      </Canvas>
    </View>
  );
}
