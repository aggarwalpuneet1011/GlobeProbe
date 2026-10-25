import React, { Component, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';
import { Canvas as SkCanvas, Picture, Skia } from '@shopify/react-native-skia';
import type { SimSession } from '../sims/engine';
import { getHeightmap, type LandformSim } from '../sims/landform';
import { HM_SIZE, planeHeights, terrainRgb, NECK_SADDLE } from './heightmap';
import { T } from '../ui/Text';
import { C } from '../ui/theme';
import { usePrefs } from '../ui/prefs';
import { logError } from '../state/errorlog';

const SEG = 80;
const SCALE = 2.4;
const NECK = { x: (104 / (HM_SIZE - 1) - 0.5) * 10, z: (112 / (HM_SIZE - 1) - 0.5) * 10 };
const CAM = { top: [0, 15, 0.01], angle: [0, 9.5, 9.5], side: [0, 3.2, 14] } as const;

function Scene({ session, highlight, reduceMotion }: { session: SimSession; highlight: string | null; reduceMotion: boolean }) {
  const sim = session.sim as LandformSim;
  const heights = useMemo(() => planeHeights(getHeightmap(), SEG), []);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(10, 10, SEG, SEG);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) pos.setY(k, heights[k] * SCALE);
    g.computeVertexNormals();
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
    return g;
  }, [heights]);
  const water = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const group = useRef<THREE.Group>(null);
  const lastSea = useRef(Number.NaN);
  const frame = useRef(0);
  const { camera } = useThree();
  const want = useRef(new THREE.Vector3(...CAM.angle));

  useFrame((_, dt) => {
    session.tick(dt);
    const sea = sim.seaLevel;
    if (water.current) water.current.position.y = sea * SCALE;
    if (Math.abs(sea - lastSea.current) > 0.002 || Number.isNaN(lastSea.current)) {
      lastSea.current = sea;
      const col = geo.attributes.color as THREE.BufferAttribute;
      for (let k = 0; k < heights.length; k++) { const [r, g, b] = terrainRgb(heights[k], sea); col.setXYZ(k, r, g, b); }
      col.needsUpdate = true;
    }
    const preset = CAM[sim.controls.camera as keyof typeof CAM] ?? CAM.angle;
    want.current.set(preset[0], preset[1], preset[2]);
    camera.position.lerp(want.current, reduceMotion ? 1 : Math.min(1, dt * 4));
    camera.lookAt(0, 0.4, 0);
    if (group.current) group.current.rotation.y = (((sim.controls.turn as number) ?? 0) * Math.PI) / 180;
    if (ring.current) {
      ring.current.visible = highlight === 'neck';
      const s = reduceMotion ? 1 : 1 + 0.12 * Math.sin(++frame.current / 8);
      ring.current.scale.set(s, s, s);
      ring.current.position.y = Math.max(sea, NECK_SADDLE) * SCALE + 0.15;
    }
  });

  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[6, 10, 4]} intensity={1.1} />
      <group ref={group}>
        <mesh geometry={geo}><meshStandardMaterial vertexColors flatShading={false} roughness={0.95} /></mesh>
        <mesh ref={water} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[10.4, 10.4]} />
          <meshStandardMaterial color="#4FA3E0" transparent opacity={0.45} roughness={0.2} />
        </mesh>
        <mesh ref={ring} position={[NECK.x, 1, NECK.z]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <torusGeometry args={[0.7, 0.07, 10, 36]} />
          <meshBasicMaterial color={C.coral} />
        </mesh>
      </group>
    </>
  );
}

/** Plan C for the landform: a flat top-down map from the same heightmap, recoloured as the sea moves. */
function FlatMap({ session, width }: { session: SimSession; width: number }) {
  const sim = session.sim as LandformSim;
  const [pic, setPic] = useState<ReturnType<ReturnType<typeof Skia.PictureRecorder>['finishRecordingAsPicture']> | null>(null);
  useEffect(() => {
    let last = Number.NaN;
    const draw = () => {
      session.tick(0.1);
      const sea = sim.seaLevel;
      if (Math.abs(sea - last) < 0.002) return;
      last = sea;
      const hm = getHeightmap(); const N = 64; const cell = width / N;
      const rec = Skia.PictureRecorder(); const c = rec.beginRecording(Skia.XYWHRect(0, 0, width, width));
      const p = Skia.Paint();
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const [r, g, b] = terrainRgb(hm[Math.floor((j / N) * HM_SIZE) * HM_SIZE + Math.floor((i / N) * HM_SIZE)], sea);
        p.setColor(Skia.Color(`rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`));
        c.drawRect(Skia.XYWHRect(i * cell, j * cell, cell + 0.5, cell + 0.5), p);
      }
      setPic(rec.finishRecordingAsPicture());
    };
    draw();
    const id = setInterval(draw, 100);
    return () => clearInterval(id);
  }, [session, sim, width]);
  return <SkCanvas style={{ width, height: width }}>{pic ? <Picture picture={pic} /> : null}</SkCanvas>;
}

class GlGuard extends Component<{ onFail: () => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { void logError('landform-gl', e); this.props.onFail(); }
  render() { return this.state.failed ? null : this.props.children; }
}

/**
 * C08 3D scene: terrain from the heightmap, a translucent sea plane at the sea level, camera presets and a drag-to-turn gesture.
 * If GL fails twice (an error boundary catches it) the panel switches to a flat map and says so in the log.
 */
export function LandformPanel({ session, width, highlight = null, interactive = true }: { session: SimSession; width: number; highlight?: string | null; interactive?: boolean }) {
  const sim = session.sim as LandformSim;
  const { reduceMotion } = usePrefs();
  const [fails, setFails] = useState(0);
  const [label, setLabel] = useState<string>(sim.label);
  const height = width;
  const turnStart = useRef(0);
  useEffect(() => {
    const id = setInterval(() => setLabel((cur) => (sim.label !== cur ? sim.label : cur)), 120);
    return () => clearInterval(id);
  }, [sim]);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => interactive,
    onMoveShouldSetPanResponder: (_, g) => interactive && Math.abs(g.dx) > 6,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { turnStart.current = sim.controls.turn as number; },
    onPanResponderMove: (_, g) => sim.setControl('turn', turnStart.current + (g.dx / width) * 90),
  }), [interactive, sim, width]);
  const flat = fails >= 2;
  return (
    <View accessible accessibilityLabel={`${label}. A model of the land and the sea. Drag sideways to turn it.`} style={{ width, height, borderRadius: 20, overflow: 'hidden', borderWidth: 2, borderColor: C.ink, backgroundColor: C.sky }} {...pan.panHandlers}>
      {flat ? <FlatMap session={session} width={width} /> : (
        <GlGuard onFail={() => setFails((n) => n + 1)} key={fails}>
          <Canvas style={{ width, height }} camera={{ position: [...CAM.angle], fov: 42 }} pointerEvents="none" onCreated={(s) => { s.gl.setClearColor(C.sky); }}>
            <Scene session={session} highlight={highlight} reduceMotion={reduceMotion} />
          </Canvas>
        </GlGuard>
      )}
      <View pointerEvents="none" style={{ position: 'absolute', left: 12, top: 12, backgroundColor: C.paper, borderColor: C.ink, borderWidth: 2, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4 }}>
        <T v="label">{label}</T>
      </View>
    </View>
  );
}
