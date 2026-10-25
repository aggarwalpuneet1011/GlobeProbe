// Landform heightmap for C08. The supplied kit has no heightmap, so this builds the 256x256 map at runtime
//. Heights are in world units: max 1.2; the sea floor goes down to -0.3.
//
// Shape (x to the right, y down):
//  - a mainland on the left,
//  - a peninsula bulb joined to it by a low, narrow neck whose saddle is 0.13 (floods when the sea reaches ~0.13, so at +0.15),
//  - a separate small island offshore whose submerged bridge to the mainland has its saddle at -0.17 (joins at -0.2).
import { smoothstep } from '../sims/engine';

export const HM_SIZE = 256;
export const HM_MAX = 1.2;
export const HM_FLOOR = -0.3;
export const NECK_SADDLE = 0.13;
export const BRIDGE_SADDLE = -0.17;
export const SEA_MIN = -0.25;
export const SEA_MAX = 0.35;
export const PENINSULA_SEED = { x: 165, y: 112 };
export const ISLAND_SEED = { x: 128, y: 205 };
export const MAINLAND_SEED = { x: 12, y: 128 };

// Deterministic value noise (no Math.random so the terrain is identical on every device).
function hash(ix: number, iy: number): number {
  let h = (ix * 374761393 + iy * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x: number, y: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y); const fx = x - x0, fy = y - y0;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0), b = hash(x0 + 1, y0), c = hash(x0, y0 + 1), d = hash(x0 + 1, y0 + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const sm = (edge0: number, edge1: number, x: number) => smoothstep(edge0, edge1, x);

export function heightAt(x: number, y: number): number {
  // Mainland
  const coast = 92 + 8 * Math.sin(y / 23);
  const d = coast - x; // positive inland
  const mainland = HM_FLOOR + 0.5 * sm(-10, 6, d) + 0.7 * sm(0, 80, d) * (0.75 + 0.25 * noise(x / 18, y / 18));
  // Peninsula bulb
  const ex = (x - 165) / 50, ey = (y - 112) / 30; const r = Math.sqrt(ex * ex + ey * ey);
  const bulb = HM_FLOOR + 1.25 * sm(1.05, 0.55, r) * (0.85 + 0.15 * noise(x / 10, y / 10));
  // Neck: a narrow low ridge with its lowest point (the saddle) at x = 104
  let neck = HM_FLOOR;
  if (x >= 70 && x <= 125) {
    const rh = NECK_SADDLE + 0.5 * Math.pow(Math.abs(x - 104) / 14, 2);
    const w = sm(7, 2, Math.abs(y - 112));
    neck = HM_FLOOR + (Math.min(rh, 1.0) - HM_FLOOR) * w;
  }
  // Offshore island
  const ir = Math.hypot(x - 128, y - 205) / 12;
  const island = HM_FLOOR + 0.8 * sm(1.0, 0.4, ir);
  // Submerged bridge: saddle at x = 108
  let bridge = HM_FLOOR;
  if (x >= 70 && x <= 135) {
    const bh = BRIDGE_SADDLE + 0.5 * Math.pow(Math.abs(x - 108) / 20, 2);
    const w = sm(7, 2, Math.abs(y - 205));
    bridge = HM_FLOOR + (Math.min(bh, 1.0) - HM_FLOOR) * w;
  }
  let h = Math.max(mainland, bulb, neck, island, bridge);
  // Small hills on the high ground only, so shorelines and saddles are untouched
  h += 0.06 * (noise(x / 5, y / 5) - 0.5) * sm(0.3, 0.6, h);
  return Math.min(HM_MAX, Math.max(HM_FLOOR, h));
}

export function buildHeightmap(size = HM_SIZE): Float32Array {
  const out = new Float32Array(size * size);
  const k = HM_SIZE / size;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) out[j * size + i] = heightAt(i * k, j * k);
  return out;
}

/** Bilinear sample of a size x size map at map coordinates (0..size-1). */
export function sampleHeight(hm: Float32Array, x: number, y: number, size = HM_SIZE): number {
  const fx = Math.min(size - 1, Math.max(0, x)), fy = Math.min(size - 1, Math.max(0, y));
  const x0 = Math.floor(fx), y0 = Math.floor(fy); const x1 = Math.min(size - 1, x0 + 1), y1 = Math.min(size - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const a = hm[y0 * size + x0], b = hm[y0 * size + x1], c = hm[y1 * size + x0], d = hm[y1 * size + x1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/** Heights at the (segments+1)^2 vertices of PlaneGeometry(10, 10, segments, segments), row-major from the top-left. */
export function planeHeights(hm: Float32Array, segments = 96, size = HM_SIZE): Float32Array {
  const n = segments + 1; const out = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) out[j * n + i] = sampleHeight(hm, (i / segments) * (size - 1), (j / segments) * (size - 1), size);
  return out;
}

export type Band = 'sand' | 'green' | 'stone';
/** Vertex colours by height: below 0.05 Sand, 0.05 to 0.6 Green, above 0.6 Stone. */
export const terrainBand = (h: number): Band => (h < 0.05 ? 'sand' : h <= 0.6 ? 'green' : 'stone');

/** Flood fill from a seed over cells above the sea. Returns a mask of the connected land. */
export function connectedLand(hm: Float32Array, seaLevel: number, seed = MAINLAND_SEED, size = HM_SIZE): Uint8Array {
  const seen = new Uint8Array(size * size);
  const si = Math.round(seed.y) * size + Math.round(seed.x);
  if (!(hm[si] > seaLevel)) return seen;
  const stack = new Int32Array(size * size); let sp = 0; stack[sp++] = si; seen[si] = 1;
  while (sp) {
    const p = stack[--sp]; const px = p % size, py = (p - px) / size;
    const nb = [px > 0 ? p - 1 : -1, px < size - 1 ? p + 1 : -1, py > 0 ? p - size : -1, py < size - 1 ? p + size : -1];
    for (const q of nb) if (q >= 0 && !seen[q] && hm[q] > seaLevel) { seen[q] = 1; stack[sp++] = q; }
  }
  return seen;
}

export interface LandformState { label: 'Peninsula' | 'Island'; islandJoined: boolean; neckFlooded: boolean }
export function landformState(hm: Float32Array, seaLevel: number, size = HM_SIZE): LandformState {
  const k = size / HM_SIZE;
  const land = connectedLand(hm, seaLevel, { x: MAINLAND_SEED.x * k, y: MAINLAND_SEED.y * k }, size);
  const at = (p: { x: number; y: number }) => land[Math.round(p.y * k) * size + Math.round(p.x * k)] === 1;
  const joined = at(PENINSULA_SEED);
  return { label: joined ? 'Peninsula' : 'Island', islandJoined: at(ISLAND_SEED), neckFlooded: !joined };
}

// ---- colours: land by height band, sea floor by depth. Returned as 0..1 RGB so they drop straight into a vertex colour buffer.
const hex = (s: string): [number, number, number] => [parseInt(s.slice(1, 3), 16) / 255, parseInt(s.slice(3, 5), 16) / 255, parseInt(s.slice(5, 7), 16) / 255];
export const LAND_COLOURS = { sand: hex('#E8D5A0'), green: hex('#7FBF6A'), stone: hex('#9A9AA0'), shallow: hex('#74C6DE'), deep: hex('#2D7FB0') };
export function terrainRgb(h: number, seaLevel: number): [number, number, number] {
  if (h <= seaLevel) {
    const t = Math.min(1, Math.max(0, (seaLevel - h) / (seaLevel - HM_FLOOR + 1e-6)));
    const a = LAND_COLOURS.shallow, b = LAND_COLOURS.deep;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  return LAND_COLOURS[terrainBand(h)];
}
