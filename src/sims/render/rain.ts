import type { SkCanvas } from '@shopify/react-native-skia';
import { CLOUD_BASE_Y, GROUND_Y, PUDDLE, PUDDLE_CAP, RAIN_TABLE, RainSim } from '../rain';
import { C } from '../../ui/theme';
import type { Bounds, Interaction, Renderer } from './SimView';
import { circle, cloud, drop, ellipse, fillPaint, kid, label, line, rect, strokePaint, W, H, R } from './kit';
import { mulberry32 } from '../../util/rng';

const DOT_SEEDS = (() => { const r = mulberry32(5); return Array.from({ length: 9 }, () => ({ a: r() * 6.28, rx: 10 + r() * 22, ry: 6 + r() * 10, sp: 1 + r() * 1.5, ph: r() * 6.28 })); })();
export const CLOUD_POS = { x: 180, y: 84 };

export const renderRain: Renderer<RainSim> = (c: SkCanvas, sim, env) => {
  const raining = sim.rainLeft > 0;
  const pressed = !!sim.controls.press;
  env.layer(c, 'bg', () => {
    c.drawRect(R(0, 0, W, H), fillPaint(raining ? '#9FB3C8' : C.sky));
    // street
    rect(c, -4, GROUND_Y, W + 8, 14, '#B8B2A5', C.ink, 2);
    rect(c, -4, GROUND_Y + 14, W + 8, H - GROUND_Y, '#8C95A0', C.ink, 2);
    for (let x = 10; x < W; x += 54) line(c, x, GROUND_Y + 46, x + 26, GROUND_Y + 46, '#F5F1E6', 3);
  });
  env.layer(c, 'cloud', () => {
    cloud(c, CLOUD_POS.x, CLOUD_POS.y, 140, raining || pressed, 1, 5);
    if (!pressed && !raining) label(c, env.font, 'press and hold the cloud', CLOUD_POS.x, CLOUD_POS.y + 74);
  });
  // Droplets inside the cloud: dots that bump and merge. More hold time = fewer, bigger dots.
  env.layer(c, 'cloud_droplets', () => {
    const merge = pressed ? Math.min(1, sim.holdTime / 3) : sim.type === 'none' ? 0 : 1;
    const n = Math.max(1, Math.round(9 - merge * 8));
    for (let i = 0; i < n; i++) {
      const d = DOT_SEEDS[i];
      const x = CLOUD_POS.x + Math.cos(d.a + sim.time * d.sp + d.ph) * d.rx * (1 - merge * 0.7);
      const y = CLOUD_POS.y + 6 + Math.sin(d.a * 1.3 + sim.time * d.sp) * d.ry * (1 - merge * 0.6);
      circle(c, x, y, 2.6 + merge * 4.2, C.sea, C.ink, 1.2);
    }
    // 3-segment meter fills while held
    for (let s = 0; s < 3; s++) rect(c, CLOUD_POS.x - 36 + s * 26, CLOUD_POS.y + 42, 22, 9, s < sim.segments ? C.coral : '#FFFFFF', C.ink, 2, 4);
  });

  // Drops
  const d = sim.drops;
  for (let i = 0; i < d.size; i++) {
    if (!d.active[i]) continue;
    const t = d.a[i] === 1 ? RAIN_TABLE.drizzle : d.a[i] === 2 ? RAIN_TABLE.rain : RAIN_TABLE.downpour;
    drop(c, d.x[i], d.y[i], t.w, t.h);
  }
  // Puddle with ripple rings
  const level = Math.min(1.6, sim.puddle / PUDDLE_CAP);
  ellipse(c, (PUDDLE.x0 + PUDDLE.x1) / 2, GROUND_Y + 8, 28 + level * 28, 5 + level * 5, C.sea, C.ink, 2, 0.9);
  const rp = sim.ripples;
  for (let i = 0; i < rp.size; i++) {
    if (!rp.active[i]) continue;
    const k = rp.a[i] / rp.c[i];
    ellipse(c, rp.x[i], GROUND_Y + 8, rp.b[i] * k, rp.b[i] * k * 0.35, undefined, '#FFFFFF', 1.5, 1 - k);
  }
  // Umbrella figure: drizzle = closed, walking; rain = open; downpour = open + splashes on boots.
  const walking = raining && sim.type === 'drizzle';
  const bob = walking ? Math.abs(Math.sin(sim.time * 7)) * -2 : 0;
  kid(c, 300, GROUND_Y + 14, sim.umbrellaOpen ? 'open' : raining ? 'closed' : 'closed', bob);
  if (sim.splashes) for (let i = 0; i < 5; i++) { const k = (sim.time * 5 + i * 0.37) % 1; circle(c, 292 + i * 4, GROUND_Y + 12 - Math.sin(k * 3.14) * 9, 1.6, C.sea, null, 0, 1 - k); }
  env.layer(c, 'bg', () => {
    if (raining) label(c, env.font, sim.type === 'drizzle' ? 'drizzle: tiny drops' : sim.type === 'rain' ? 'rain: bigger drops' : 'downpour: huge drops', 180, 36);
  });
  void strokePaint;
};

export const rainBounds: Bounds<RainSim> = (_s, layer) => (layer === 'cloud_droplets' ? [CLOUD_POS.x - 60, CLOUD_POS.y - 40, 120, 96] : null);
export const rainSummary = (s: RainSim) => (s.rainLeft > 0 ? `It is ${s.type === 'downpour' ? 'a downpour' : s.type}.` : 'No rain yet. Press and hold the cloud.');
export const rainInteraction = (s: RainSim): Interaction => ({
  hit: (x, y) => Math.abs(x - CLOUD_POS.x) < 90 && Math.abs(y - CLOUD_POS.y) < 60,
  start: () => s.setControl('press', true),
  move: () => {},
  end: () => s.setControl('press', false),
});
void CLOUD_BASE_Y;
