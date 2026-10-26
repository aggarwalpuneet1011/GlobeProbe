import React, { Component, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, Pressable, View } from 'react-native';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';
import { C } from '../ui/theme';
import { T } from '../ui/Text';
import { logError } from '../state/errorlog';
import { useEarthTextures, type EarthSet, type GlobeLevel } from './earthTextures';
import {
  AUTO_DEG_PER_S, DEG, DIST_DEFAULT, DRAG_DEG_PER_DP, IDLE_SECONDS, MOMENTUM_DAMPING, MUMBAI,
  centerOn, clampDist, clampPitch, dragScale, easeInOut, facingAngle, latLonToVec3, subSolar, vec3ToLatLon, wrapAngle,
} from './globeMath';

export interface Pin { id: string; lat: number; lon: number; found: boolean; name?: string; country?: string }
export interface GlobeApi {
  flyTo: (lat: number, lon: number, dist?: number) => void;
  pickPin: (x: number, y: number) => string | null;
  pickLatLon: (x: number, y: number) => { lat: number; lon: number } | null;
}
interface Motion {
  yaw: number; pitch: number; vyaw: number; vpitch: number; dist: number; touchedAt: number; dragging: boolean;
  anim: { t0: number; fromYaw: number; fromPitch: number; toYaw: number; toPitch: number; fromDist: number; toDist: number } | null;
}

const SPACE = '#050A1C';

// ---- Shaders (level 3 only). Plain GLSL ES 1.00 style, which three converts for WebGL2.
const GLOW_VERT = `
varying vec3 vN;
void main() {
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const GLOW_FRAG = `
varying vec3 vN;
void main() {
  float i = pow(clamp(0.74 - dot(vN, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 3.2);
  gl_FragColor = vec4(0.32, 0.62, 1.0, clamp(i * 1.25, 0.0, 1.0));
}`;
const NIGHT_VERT = `
varying vec2 vUv;
varying vec3 vObjN;
void main() {
  vUv = uv;
  vObjN = normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const NIGHT_FRAG = `
uniform sampler2D map;
uniform vec3 sunDir;
varying vec2 vUv;
varying vec3 vObjN;
void main() {
  float d = dot(normalize(vObjN), normalize(sunDir));
  float night = smoothstep(0.06, -0.22, d);
  vec3 c = texture2D(map, vUv).rgb;
  gl_FragColor = vec4(c * 1.9, night);
}`;

function Scene({ level, tex, pins, showPins, dayNight, motion, api }: {
  level: GlobeLevel; tex: EarthSet; pins: Pin[]; showPins: boolean; dayNight: boolean; motion: React.MutableRefObject<Motion>; api: React.MutableRefObject<GlobeApi | null>;
}) {
  const { camera, size } = useThree();
  const group = useRef<THREE.Group>(null);
  const cloudRef = useRef<THREE.Mesh>(null);
  const cloudMat = useRef<THREE.MeshLambertMaterial>(null);
  const sunLight = useRef<THREE.DirectionalLight>(null);
  const camLight = useRef<THREE.DirectionalLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const pinRefs = useRef<(THREE.Group | null)[]>([]);

  const sunObj = useMemo(() => { const s = subSolar(new Date()); return latLonToVec3(s.lat, s.lon, 1); }, []);
  const glowUniforms = useMemo(() => ({}), []);
  const nightUniforms = useMemo(() => ({ map: { value: tex.night ?? null }, sunDir: { value: new THREE.Vector3(...sunObj) } }), [tex.night, sunObj]);
  const stars = useMemo(() => {
    const n = 700, arr = new Float32Array(n * 3); let seed = 12345;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      arr[i * 3] = 40 * r * Math.cos(a); arr[i * 3 + 1] = 40 * u; arr[i * 3 + 2] = 40 * r * Math.sin(a);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3)); return g;
  }, []);

  const dotGeom = useMemo(() => new THREE.SphereGeometry(0.013, 18, 12), []);
  const ringGeom = useMemo(() => new THREE.RingGeometry(0.021, 0.029, 36), []);
  const haloGeom = useMemo(() => new THREE.CircleGeometry(0.05, 28), []);
  const orient = useMemo(() => pins.map((p) => {
    const n = new THREE.Vector3(...latLonToVec3(p.lat, p.lon, 1)).normalize();
    return { pos: n.clone().multiplyScalar(1.004), q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n) };
  }), [pins]);

  useEffect(() => {
    api.current = {
      flyTo: (lat, lon, dist) => {
        const m = motion.current; const t = centerOn(lat, lon);
        m.anim = { t0: Date.now(), fromYaw: m.yaw, fromPitch: m.pitch, toYaw: m.yaw + wrapAngle(t.yaw - m.yaw), toPitch: t.pitch, fromDist: m.dist, toDist: clampDist(dist ?? Math.min(m.dist, 2.6)) };
        m.vyaw = m.vpitch = 0; m.touchedAt = Date.now();
      },
      pickPin: (x, y) => {
        if (!group.current) return null;
        group.current.updateMatrixWorld(true);
        let best: string | null = null, bestD = 44;
        pins.forEach((p, i) => {
          const w = orient[i].pos.clone().applyMatrix4(group.current!.matrixWorld);
          if (w.clone().normalize().z < 1 / camera.position.z + 0.02) return;   // behind the horizon
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
      const k = Math.min(1, (Date.now() - m.anim.t0) / 900); const e = easeInOut(k);
      m.yaw = m.anim.fromYaw + (m.anim.toYaw - m.anim.fromYaw) * e;
      m.pitch = m.anim.fromPitch + (m.anim.toPitch - m.anim.fromPitch) * e;
      m.dist = m.anim.fromDist + (m.anim.toDist - m.anim.fromDist) * e;
      if (k >= 1) m.anim = null;
    } else if (!m.dragging) {
      m.yaw += m.vyaw * dt; m.pitch = clampPitch(m.pitch + m.vpitch * dt);
      const damp = Math.pow(MOMENTUM_DAMPING, dt * 60); m.vyaw *= damp; m.vpitch *= damp;
      if (Math.abs(m.vyaw) < 0.001) m.vyaw = 0; if (Math.abs(m.vpitch) < 0.001) m.vpitch = 0;
      if ((Date.now() - m.touchedAt) / 1000 > IDLE_SECONDS && !m.vyaw) m.yaw += AUTO_DEG_PER_S * DEG * dt * dragScale(m.dist);
    }
    camera.position.z += (m.dist - camera.position.z) * Math.min(1, dt * 10);
    camera.lookAt(0, 0, 0);
    if (group.current) group.current.rotation.set(m.pitch, m.yaw, 0, 'XYZ');
    if (cloudRef.current) cloudRef.current.rotation.y += dt * 0.004;
    if (cloudMat.current) cloudMat.current.opacity = THREE.MathUtils.clamp((camera.position.z - 1.5) / 1.8, 0.22, 0.85);   // clouds thin out as you zoom in, so land stays readable
    const k = THREE.MathUtils.clamp(camera.position.z / DIST_DEFAULT, 0.45, 1.7);
    for (const g of pinRefs.current) if (g) g.scale.setScalar(k);
    if (sunLight.current) sunLight.current.visible = dayNight;
    if (camLight.current) camLight.current.visible = !dayNight;
    if (ambient.current) ambient.current.intensity = dayNight ? 0.14 : 0.62;
  });

  return (
    <>
      <points geometry={stars}><pointsMaterial size={0.16} color="#FFFFFF" sizeAttenuation transparent opacity={0.85} depthWrite={false} /></points>
      <ambientLight ref={ambient} intensity={0.62} />
      <directionalLight ref={camLight} position={[2, 1.2, 5]} intensity={1.15} />
      <group ref={group}>
        <directionalLight ref={sunLight} position={[sunObj[0] * 5, sunObj[1] * 5, sunObj[2] * 5]} intensity={2.1} />
        <mesh name="earth">
          <sphereGeometry args={[1, 128, 64]} />
          {level === 1
            ? <meshLambertMaterial map={tex.day} />
            : <meshPhongMaterial map={tex.day} specularMap={tex.spec ?? null} bumpMap={tex.bump ?? null} bumpScale={6} specular="#4A6A8F" shininess={24} />}
        </mesh>
        {level === 3 && tex.night ? (
          <mesh visible={dayNight}>
            <sphereGeometry args={[1.002, 128, 64]} />
            <shaderMaterial uniforms={nightUniforms} vertexShader={NIGHT_VERT} fragmentShader={NIGHT_FRAG} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        ) : null}
        {level >= 2 && tex.clouds ? (
          <mesh ref={cloudRef} renderOrder={1}>
            <sphereGeometry args={[1.012, 96, 48]} />
            <meshLambertMaterial ref={cloudMat} color="#FFFFFF" alphaMap={tex.clouds} transparent opacity={0.85} depthWrite={false} />
          </mesh>
        ) : null}
        {showPins ? pins.map((p, i) => (
          <group key={p.id} ref={(g) => { pinRefs.current[i] = g; }} position={orient[i].pos.toArray()} quaternion={orient[i].q}>
            <mesh geometry={haloGeom} renderOrder={3}><meshBasicMaterial color={p.found ? '#7CE0A3' : C.coral} transparent opacity={0.28} depthWrite={false} /></mesh>
            <mesh geometry={ringGeom} renderOrder={4} position={[0, 0, 0.001]}><meshBasicMaterial color="#FFFFFF" transparent opacity={0.95} depthWrite={false} side={THREE.DoubleSide} /></mesh>
            <mesh geometry={dotGeom} renderOrder={5} position={[0, 0, 0.006]}><meshBasicMaterial color={p.found ? '#7CE0A3' : C.coral} transparent opacity={1} /></mesh>
          </group>
        )) : null}
      </group>
      {level === 3 ? (
        <mesh>
          <sphereGeometry args={[1.17, 72, 40]} />
          <shaderMaterial uniforms={glowUniforms} vertexShader={GLOW_VERT} fragmentShader={GLOW_FRAG} side={THREE.BackSide} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ) : (
        <mesh><sphereGeometry args={[1.05, 48, 32]} /><meshBasicMaterial color="#6FB6FF" transparent opacity={0.16} side={THREE.BackSide} depthWrite={false} /></mesh>
      )}
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
 * The 3D Earth (NASA Blue Marble). Quality levels step down automatically if the phone cannot do something:
 * 3 = clouds, relief, ocean glints, atmosphere glow, night lights. 2 = no custom shaders. 1 = plain map. The caller shows the flat map after that.
 * Gestures: drag turns it (slower when zoomed in), pinch or the +/- buttons zoom 1.45 to 6, double-tap flies to Mumbai.
 */
export const GlobeView = React.forwardRef<GlobeApi, {
  size: number; pins: Pin[]; showPins: boolean; dayNight: boolean; active: boolean; level: GlobeLevel;
  onPin: (id: string) => void; onTapLatLon?: (lat: number, lon: number) => void; onFail: (e: unknown) => void;
}>(function GlobeView({ size, pins, showPins, dayNight, active, level, onPin, onTapLatLon, onFail }, ref) {
  const api = useRef<GlobeApi | null>(null);
  const start = centerOn(MUMBAI.lat, MUMBAI.lon);
  const motion = useRef<Motion>({ yaw: start.yaw, pitch: start.pitch, vyaw: 0, vpitch: 0, dist: DIST_DEFAULT, touchedAt: Date.now(), dragging: false, anim: null });
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const gesture = useRef({ x0: 0, y0: 0, t0: 0, lastX: 0, lastY: 0, pinch0: 0, dist0: DIST_DEFAULT, moved: 0 });
  const failed = useRef(false);
  const fail = (where: string) => (e: unknown) => { if (failed.current) return; failed.current = true; void logError(`${where}-L${level}`, e); onFail(e); };
  const tex = useEarthTextures(level, fail('globe-tex'));
  const [label, setLabel] = useState<{ name: string; country?: string } | null>(null);

  useImperativeHandle(ref, () => ({
    flyTo: (la, lo, d) => api.current?.flyTo(la, lo, d),
    pickPin: (x, y) => api.current?.pickPin(x, y) ?? null,
    pickLatLon: (x, y) => api.current?.pickLatLon(x, y) ?? null,
  }));

  // Name of the place nearest the middle of the view, checked a few times a second.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      const m = motion.current; const lim = (Math.min(1, m.dist / DIST_DEFAULT) * 11 + 3) * DEG;
      let best: Pin | null = null, bestA = lim;
      for (const p of pins) { const a = facingAngle(p.lat, p.lon, m.yaw, m.pitch); if (a < bestA) { bestA = a; best = p; } }
      setLabel((prev) => (best?.name ? (prev?.name === best.name ? prev : { name: best.name, country: best.country }) : prev ? null : prev));
    }, 300);
    return () => clearInterval(id);
  }, [active, pins]);

  const zoomBy = (f: number) => { const m = motion.current; m.anim = null; m.dist = clampDist(m.dist * f); m.touchedAt = Date.now(); };

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
        g.moved = 99; g.lastX = e.nativeEvent.locationX; g.lastY = e.nativeEvent.locationY;
        return;
      }
      if (g.pinch0) { g.pinch0 = 0; g.lastX = e.nativeEvent.locationX; g.lastY = e.nativeEvent.locationY; return; }   // one finger lifted: do not jump
      const x = e.nativeEvent.locationX, y = e.nativeEvent.locationY;
      const dx = x - g.lastX, dy = y - g.lastY; g.lastX = x; g.lastY = y;
      g.moved += Math.abs(dx) + Math.abs(dy);
      const s = DRAG_DEG_PER_DP * DEG * dragScale(m.dist);
      m.yaw += dx * s;
      m.pitch = clampPitch(m.pitch + dy * s);
    },
    onPanResponderRelease: (e, gs) => {
      const m = motion.current; const g = gesture.current;
      m.dragging = false; m.touchedAt = Date.now();
      const quick = Date.now() - g.t0 < 300 && g.moved < 10;
      if (quick) {
        const x = e.nativeEvent.locationX, y = e.nativeEvent.locationY; const now = Date.now(); const prev = lastTap.current;
        if (prev && now - prev.t < 320 && Math.hypot(prev.x - x, prev.y - y) < 40) { lastTap.current = null; api.current?.flyTo(MUMBAI.lat, MUMBAI.lon, 2.0); return; }
        lastTap.current = { t: now, x, y };
        const pin = api.current?.pickPin(x, y);
        if (pin) { onPin(pin); return; }
        const ll = api.current?.pickLatLon(x, y);
        if (ll) onTapLatLon?.(ll.lat, ll.lon);
        return;
      }
      const s = DRAG_DEG_PER_DP * DEG * dragScale(m.dist);
      m.vyaw = gs.vx * 1000 * s; m.vpitch = gs.vy * 1000 * s;
    },
    onPanResponderTerminate: () => { motion.current.dragging = false; },
  }), [onPin, onTapLatLon]);

  const btn = { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: 'rgba(5,10,28,0.62)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)' };
  return (
    <View accessible accessibilityLabel="A 3D globe. Drag to turn it, pinch or use the plus and minus buttons to zoom, double-tap to centre Mumbai." style={{ width: size, height: size, borderRadius: 24, overflow: 'hidden', borderWidth: 2, borderColor: C.ink, backgroundColor: SPACE }} {...pan.panHandlers}>
      {tex ? (
        <GlGuard onFail={fail('globe-gl')}>
          <Canvas style={{ width: size, height: size }} frameloop={active ? 'always' : 'never'} flat linear camera={{ position: [0, 0, DIST_DEFAULT], fov: 40, near: 0.05, far: 100 }} pointerEvents="none"
            onCreated={(s) => {
              s.gl.setClearColor(SPACE);
              (s.gl.debug as { onShaderError: unknown }).onShaderError = (_gl: unknown, _prog: unknown, vs: { getShaderInfoLog?: unknown }) => fail('globe-shader')(new Error(`shader compile failed ${String(vs?.getShaderInfoLog ?? '')}`));
            }}>
            <Scene level={level} tex={tex} pins={pins} showPins={showPins} dayNight={dayNight} motion={motion} api={api} />
          </Canvas>
        </GlGuard>
      ) : (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <ActivityIndicator color="#FFFFFF" /><T v="label" color="#FFFFFF">Loading Earth…</T>
        </View>
      )}
      {tex ? (
        <>
          <View pointerEvents="box-none" style={{ position: 'absolute', right: 10, top: 10, gap: 8 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" hitSlop={6} onPress={() => zoomBy(0.72)} style={btn}><T v="h2" color="#FFFFFF" style={{ lineHeight: 26 }}>+</T></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" hitSlop={6} onPress={() => zoomBy(1.4)} style={btn}><T v="h2" color="#FFFFFF" style={{ lineHeight: 26 }}>−</T></Pressable>
          </View>
          {label ? (
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 12, alignItems: 'center' }}>
              <View style={{ backgroundColor: 'rgba(5,10,28,0.72)', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' }}>
                <T v="label" color="#FFFFFF">{label.name}{label.country ? ` · ${label.country}` : ''}</T>
              </View>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
});
