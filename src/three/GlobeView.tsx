import React, { Component, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';
import { Asset } from 'expo-asset';
import { EARTH_TEXTURE } from '../ui/assets';
import { C } from '../ui/theme';
import { logError } from '../state/errorlog';
import {
  AUTO_DEG_PER_S, DEG, DIST_DEFAULT, DRAG_DEG_PER_DP, IDLE_SECONDS, MOMENTUM_DAMPING, MUMBAI,
  centerOn, clampDist, clampPitch, easeInOut, latLonToVec3, subSolar, vec3ToLatLon, wrapAngle,
} from './globeMath';

export interface Pin { id: string; lat: number; lon: number; found: boolean }
export interface GlobeApi {
  flyTo: (lat: number, lon: number) => void;
  pickPin: (x: number, y: number) => string | null;
  pickLatLon: (x: number, y: number) => { lat: number; lon: number } | null;
}
interface Motion {
  yaw: number; pitch: number; vyaw: number; vpitch: number; dist: number; touchedAt: number; dragging: boolean;
  anim: { t0: number; fromYaw: number; fromPitch: number; toYaw: number; toPitch: number } | null;
}

function EarthA() {
  const tex = useLoader(THREE.TextureLoader, EARTH_TEXTURE as never) as THREE.Texture;
  return <Sphere tex={tex} />;
}
function EarthB({ onFail }: { onFail: (e: unknown) => void }) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const a = Asset.fromModule(EARTH_TEXTURE);
        await a.downloadAsync();
        new THREE.TextureLoader().load(a.localUri ?? a.uri, (t) => alive && setTex(t), undefined, (e) => onFail(e));
      } catch (e) { onFail(e); }
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return tex ? <Sphere tex={tex} /> : null;
}
function Sphere({ tex }: { tex: THREE.Texture }) {
  return (
    <mesh name="earth">
      <sphereGeometry args={[1, 64, 48]} />
      <meshStandardMaterial map={tex} roughness={0.9} metalness={0} />
    </mesh>
  );
}

function Scene({ plan, pins, showPins, dayNight, motion, api, onFail }: {
  plan: 'A' | 'B'; pins: Pin[]; showPins: boolean; dayNight: boolean; motion: React.MutableRefObject<Motion>; api: React.MutableRefObject<GlobeApi | null>; onFail: (e: unknown) => void;
}) {
  const { camera, size } = useThree();
  const group = useRef<THREE.Group>(null);
  const sunLight = useRef<THREE.DirectionalLight>(null);
  const camLight = useRef<THREE.DirectionalLight>(null);
  const sun = useMemo(() => latLonToVec3(subSolar(new Date()).lat, subSolar(new Date()).lon, 5), []);
  const pinGeom = useMemo(() => new THREE.ConeGeometry(0.028, 0.09, 10), []);
  const orient = useMemo(() => pins.map((p) => {
    const v = new THREE.Vector3(...latLonToVec3(p.lat, p.lon, 1.0));
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), v.clone().normalize()); // cone tip down onto the surface
    return { pos: v.clone().multiplyScalar(1.05), q };
  }), [pins]);

  useEffect(() => {
    api.current = {
      flyTo: (lat, lon) => {
        const m = motion.current; const t = centerOn(lat, lon);
        m.anim = { t0: Date.now(), fromYaw: m.yaw, fromPitch: m.pitch, toYaw: m.yaw + wrapAngle(t.yaw - m.yaw), toPitch: t.pitch };
        m.vyaw = m.vpitch = 0; m.touchedAt = Date.now();
      },
      pickPin: (x, y) => {
        if (!group.current) return null;
        group.current.updateMatrixWorld(true);
        let best: string | null = null, bestD = 34;
        pins.forEach((p, i) => {
          const w = orient[i].pos.clone().applyMatrix4(group.current!.matrixWorld);
          if (w.z < 0.25) return;                                         // behind the globe
          const s = w.clone().project(camera);
          const px = (s.x * 0.5 + 0.5) * size.width, py = (1 - (s.y * 0.5 + 0.5)) * size.height;
          const d = Math.hypot(px - x, py - y);
          if (d < bestD) { bestD = d; best = p.id; }
        });
        return best;
      },
      pickLatLon: (x, y) => {
        if (!group.current) return null;
        group.current.updateMatrixWorld(true);
        const ndc = new THREE.Vector2((x / size.width) * 2 - 1, -((y / size.height) * 2 - 1));
        const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
        const hit = ray.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1), new THREE.Vector3());
        if (!hit) return null;
        const local = group.current.worldToLocal(hit.clone());
        return vec3ToLatLon([local.x, local.y, local.z]);
      },
    };
    return () => { api.current = null; };
  }, [pins, orient, camera, size.width, size.height]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05); const m = motion.current;
    if (m.anim) {
      const k = Math.min(1, (Date.now() - m.anim.t0) / 800); const e = easeInOut(k);
      m.yaw = m.anim.fromYaw + (m.anim.toYaw - m.anim.fromYaw) * e;
      m.pitch = m.anim.fromPitch + (m.anim.toPitch - m.anim.fromPitch) * e;
      if (k >= 1) m.anim = null;
    } else if (!m.dragging) {
      m.yaw += m.vyaw * dt; m.pitch = clampPitch(m.pitch + m.vpitch * dt);
      const damp = Math.pow(MOMENTUM_DAMPING, dt * 60); m.vyaw *= damp; m.vpitch *= damp;
      if (Math.abs(m.vyaw) < 0.001) m.vyaw = 0; if (Math.abs(m.vpitch) < 0.001) m.vpitch = 0;
      if ((Date.now() - m.touchedAt) / 1000 > IDLE_SECONDS && !m.vyaw) m.yaw += AUTO_DEG_PER_S * DEG * dt;
    }
    camera.position.z += (m.dist - camera.position.z) * Math.min(1, dt * 10);
    camera.lookAt(0, 0, 0);
    if (group.current) group.current.rotation.set(m.pitch, m.yaw, 0, 'XYZ');
    if (sunLight.current) sunLight.current.visible = dayNight;
    if (camLight.current) camLight.current.visible = !dayNight;
  });

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight ref={camLight} position={[0, 0.5, 5]} intensity={1.1} />
      <group ref={group}>
        <directionalLight ref={sunLight} position={sun} intensity={1.2} />
        {plan === 'A' ? <EarthA /> : <EarthB onFail={onFail} />}
        <mesh><sphereGeometry args={[1.03, 48, 32]} /><meshBasicMaterial color="#BFE6FF" transparent opacity={0.18} side={THREE.BackSide} /></mesh>
        {showPins ? pins.map((p, i) => (
          <group key={p.id} position={orient[i].pos.toArray()} quaternion={orient[i].q}>
            <mesh geometry={pinGeom} position={[0, 0.045, 0]} rotation={[Math.PI, 0, 0]}><meshStandardMaterial color={C.coral} /></mesh>
            <mesh position={[0, 0.1, 0]}><sphereGeometry args={[0.035, 14, 10]} /><meshStandardMaterial color={p.found ? '#FFFFFF' : C.coral} /></mesh>
          </group>
        )) : null}
      </group>
    </>
  );
}

class GlGuard extends Component<{ onFail: (e: unknown) => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { this.props.onFail(e); }
  render() { return this.state.failed ? null : this.props.children; }
}

/**
 * The 3D Earth. Plan A: texture via useLoader. Plan B: texture via expo-asset. After a second failure the caller shows the flat Equal Earth map (Plan C).
 * Gestures: drag rotates (0.4 deg per dp, momentum 0.92 per frame), pinch zooms 2.2 to 4.0, double-tap flies to Mumbai, idle 6 s auto-rotates.
 */
export const GlobeView = React.forwardRef<GlobeApi, {
  size: number; pins: Pin[]; showPins: boolean; dayNight: boolean; active: boolean; plan: 'A' | 'B';
  onPin: (id: string) => void; onTapLatLon?: (lat: number, lon: number) => void; onFail: (e: unknown) => void;
}>(function GlobeView({ size, pins, showPins, dayNight, active, plan, onPin, onTapLatLon, onFail }, ref) {
  const api = useRef<GlobeApi | null>(null);
  const start = centerOn(MUMBAI.lat, MUMBAI.lon);
  const motion = useRef<Motion>({ yaw: start.yaw, pitch: start.pitch, vyaw: 0, vpitch: 0, dist: DIST_DEFAULT, touchedAt: Date.now(), dragging: false, anim: null });
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const gesture = useRef({ x0: 0, y0: 0, t0: 0, lastX: 0, lastY: 0, pinch0: 0, dist0: DIST_DEFAULT, moved: 0 });
  useImperativeHandle(ref, () => ({
    flyTo: (la, lo) => api.current?.flyTo(la, lo),
    pickPin: (x, y) => api.current?.pickPin(x, y) ?? null,
    pickLatLon: (x, y) => api.current?.pickLatLon(x, y) ?? null,
  }));

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      const m = motion.current; const g = gesture.current; const n = e.nativeEvent;
      m.dragging = true; m.anim = null; m.vyaw = m.vpitch = 0; m.touchedAt = Date.now();
      g.x0 = g.lastX = n.locationX; g.y0 = g.lastY = n.locationY; g.t0 = Date.now(); g.moved = 0; g.pinch0 = 0; g.dist0 = m.dist;
    },
    onPanResponderMove: (e) => {
      const m = motion.current; const g = gesture.current; const touches = e.nativeEvent.touches;
      m.touchedAt = Date.now();
      if (touches.length >= 2) {                                 // pinch only; two-finger rotate and pan are ignored
        const d = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
        if (!g.pinch0) { g.pinch0 = d; g.dist0 = m.dist; }
        m.dist = clampDist(g.dist0 * (g.pinch0 / Math.max(10, d)));
        g.moved = 99;
        return;
      }
      g.pinch0 = 0;
      const x = e.nativeEvent.locationX, y = e.nativeEvent.locationY;
      const dx = x - g.lastX, dy = y - g.lastY; g.lastX = x; g.lastY = y;
      g.moved += Math.abs(dx) + Math.abs(dy);
      m.yaw += dx * DRAG_DEG_PER_DP * DEG;
      m.pitch = clampPitch(m.pitch + dy * DRAG_DEG_PER_DP * DEG);
    },
    onPanResponderRelease: (e, gs) => {
      const m = motion.current; const g = gesture.current;
      m.dragging = false; m.touchedAt = Date.now();
      const quick = Date.now() - g.t0 < 300 && g.moved < 10;
      if (quick) {
        const x = e.nativeEvent.locationX, y = e.nativeEvent.locationY; const now = Date.now(); const prev = lastTap.current;
        if (prev && now - prev.t < 320 && Math.hypot(prev.x - x, prev.y - y) < 40) { lastTap.current = null; api.current?.flyTo(MUMBAI.lat, MUMBAI.lon); return; }
        lastTap.current = { t: now, x, y };
        const pin = api.current?.pickPin(x, y);
        if (pin) { onPin(pin); return; }
        const ll = api.current?.pickLatLon(x, y);
        if (ll) onTapLatLon?.(ll.lat, ll.lon);
        return;
      }
      m.vyaw = gs.vx * 1000 * DRAG_DEG_PER_DP * DEG; m.vpitch = gs.vy * 1000 * DRAG_DEG_PER_DP * DEG;
    },
    onPanResponderTerminate: () => { motion.current.dragging = false; },
  }), [onPin, onTapLatLon]);

  return (
    <View accessible accessibilityLabel="A 3D globe. Drag to turn it, pinch to zoom, double-tap to centre Mumbai." style={{ width: size, height: size, borderRadius: 24, overflow: 'hidden', borderWidth: 2, borderColor: C.ink, backgroundColor: C.cream }} {...pan.panHandlers}>
      <GlGuard onFail={(e) => { void logError('globe-gl', e); onFail(e); }}>
        <Canvas style={{ width: size, height: size }} frameloop={active ? 'always' : 'never'} camera={{ position: [0, 0, DIST_DEFAULT], fov: 40 }} pointerEvents="none"
          onCreated={(s) => { s.gl.setClearColor(C.cream); }}>
          <Scene plan={plan} pins={pins} showPins={showPins} dayNight={dayNight} motion={motion} api={api} onFail={onFail} />
        </Canvas>
      </GlGuard>
    </View>
  );
});
