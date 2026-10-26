// Globe maths. Pure functions so they run under node tests.
export const DEG = Math.PI / 180;
export const DIST_MIN = 1.45;      // camera distance from the centre of a radius-1 Earth: close enough to read a country
export const DIST_MAX = 6.0;       // far enough to see the whole globe with space around it
export const DIST_DEFAULT = 3.4;
export const PITCH_LIMIT = 80 * DEG;
export const DRAG_DEG_PER_DP = 0.4;
export const IDLE_SECONDS = 6;
export const AUTO_DEG_PER_S = 4;
export const MOMENTUM_DAMPING = 0.92;
export const MUMBAI = { lat: 19.076, lon: 72.878 };

export type V3 = [number, number, number];

/** Point on the unit sphere for lat/lon, matching THREE.SphereGeometry's equirectangular texture (lon -180 at u = 0). */
export function latLonToVec3(latDeg: number, lonDeg: number, r = 1): V3 {
  const phi = (90 - latDeg) * DEG, theta = (lonDeg + 180) * DEG;
  return [-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)];
}
export function vec3ToLatLon([x, y, z]: V3): { lat: number; lon: number } {
  const r = Math.hypot(x, y, z) || 1;
  const lat = 90 - Math.acos(Math.max(-1, Math.min(1, y / r))) / DEG;
  let lon = Math.atan2(z, -x) / DEG - 180;
  while (lon < -180) lon += 360;
  while (lon > 180) lon -= 360;
  return { lat, lon };
}

/** Sub-solar point from UTC time: longitude (12 - UTC hours) x 15, latitude = 23.44 x sin(2 pi (dayOfYear - 81) / 365). */
export function subSolar(date: Date): { lat: number; lon: number } {
  const utcH = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start) / 86400000);
  let lon = (12 - utcH) * 15; if (lon > 180) lon -= 360; if (lon < -180) lon += 360;
  return { lat: 23.44 * Math.sin((2 * Math.PI * (dayOfYear - 81)) / 365), lon };
}

/** Euler angles (XYZ order, rotation = Rx(pitch) Ry(yaw)) that bring lat/lon to face the camera on +z. */
export function centerOn(latDeg: number, lonDeg: number): { yaw: number; pitch: number } {
  const [px, py, pz] = latLonToVec3(latDeg, lonDeg);
  return { yaw: Math.atan2(-px, pz), pitch: Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, Math.atan2(py, Math.hypot(px, pz)))) };
}
/** Apply Rx(pitch) Ry(yaw) to a vector (what the globe group does to its pins). */
export function rotateVec([x, y, z]: V3, yaw: number, pitch: number): V3 {
  const x1 = x * Math.cos(yaw) + z * Math.sin(yaw), z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
  return [x1, y * Math.cos(pitch) - z1 * Math.sin(pitch), y * Math.sin(pitch) + z1 * Math.cos(pitch)];
}

export const clampDist = (d: number) => Math.min(DIST_MAX, Math.max(DIST_MIN, d));
/** Drag speed multiplier: slower when zoomed in (so a finger moves the surface under it), faster when zoomed out. 1 at the default distance. */
export const dragScale = (dist: number) => Math.min(1.4, Math.max(0.2, (dist - 1) / (DIST_DEFAULT - 1)));
/** Angle (radians) between a place and the point the camera is looking at, given the current yaw/pitch. 0 = dead centre, > pi/2 = far side. */
export function facingAngle(latDeg: number, lonDeg: number, yaw: number, pitch: number): number {
  const [x, y, z] = rotateVec(latLonToVec3(latDeg, lonDeg), yaw, pitch);
  return Math.acos(Math.max(-1, Math.min(1, z / (Math.hypot(x, y, z) || 1))));
}
/** A point on the sphere is visible to a camera at distance d on +z when its z (in view space) exceeds 1/d. */
export const isFacingCamera = (zView: number, dist: number) => zView > 1 / dist + 0.01;
export const clampPitch = (p: number) => Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, p));
export const wrapAngle = (a: number) => { let x = a; while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (bLat - aLat) * DEG, dLon = (bLon - aLon) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * DEG) * Math.cos(bLat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ---- Equal Earth (Plan C flat map). Same constants as scripts/gen_assets.py; never Mercator.
const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796;
export function equalEarth(lonDeg: number, latDeg: number): { x: number; y: number } {
  const lam = lonDeg * DEG, phi = latDeg * DEG;
  const th = Math.asin((Math.sqrt(3) / 2) * Math.sin(phi));
  const t2 = th * th, t6 = t2 ** 3;
  return {
    x: (2 * Math.sqrt(3) * lam * Math.cos(th)) / (3 * (9 * A4 * t6 * t2 + 7 * A3 * t6 + 3 * A2 * t2 + A1)),
    y: th * (A4 * t6 * t2 + A3 * t6 + A2 * t2 + A1),
  };
}
const XMAX = equalEarth(180, 0).x, YMAX = equalEarth(0, 90).y;
export const EQUAL_EARTH_ASPECT = XMAX / YMAX;     // width / height of the whole map
/** Position on the Equal Earth image as fractions of its width and height. */
export function equalEarthUV(lonDeg: number, latDeg: number): { u: number; v: number } {
  const { x, y } = equalEarth(lonDeg, latDeg);
  return { u: (x / XMAX + 1) / 2, v: (1 - y / YMAX) / 2 };
}
/** Inverse by search (taps on the flat map). Good to well under 1 degree. */
export function equalEarthInverse(u: number, v: number): { lat: number; lon: number } | null {
  let best: { lat: number; lon: number } | null = null, bestD = Infinity;
  for (let lat = -90; lat <= 90; lat += 1) {
    const uv = equalEarthUV(0, lat);
    const dv = Math.abs(uv.v - v);
    if (dv > 0.03) continue;
    for (let lon = -180; lon <= 180; lon += 1) {
      const p = equalEarthUV(lon, lat);
      const d = (p.u - u) ** 2 + (p.v - v) ** 2;
      if (d < bestD) { bestD = d; best = { lat, lon }; }
    }
  }
  return bestD < 0.0004 ? best : null;
}
