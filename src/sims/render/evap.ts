import type { SkCanvas } from '@shopify/react-native-skia';
import { EvapSim, PUDDLE_A, PUDDLE_B, ROAD_Y } from '../evap';
import { C } from '../../ui/theme';
import type { Bounds, Interaction, Renderer } from './SimView';
import { building, circle, ellipse, fillPaint, flag, label, line, rect, sun, W, H, wisp, R } from './kit';

const firstWisp = new WeakMap<object, number>();

export const renderEvap: Renderer<EvapSim> = (c: SkCanvas, sim, env) => {
  const sunV = sim.controls.sun as number;
  const breezy = sim.controls.wind === 'breezy';
  const shade = !!sim.controls.shade;

  env.layer(c, 'bg', () => {
    c.drawRect(R(0, 0, W, H), fillPaint(C.sky));
    // distant skyline
    building(c, 18, ROAD_Y - 60, 62, 120, '#F2D9B8');
    building(c, 190, ROAD_Y - 60, 110, 190, '#E8D5B5');
    building(c, 312, ROAD_Y - 60, 48, 90, '#F2D9B8');
    // lane (road) and pavement
    rect(c, -4, ROAD_Y - 4, W + 8, 20, '#B8B2A5', C.ink, 2);
    rect(c, -4, ROAD_Y + 16, W + 8, H - ROAD_Y, '#8C95A0', C.ink, 2);
    for (let x = 10; x < W; x += 54) line(c, x, ROAD_Y + 52, x + 26, ROAD_Y + 52, '#F5F1E6', 3);
    if (breezy) {
      flag(c, 160, ROAD_Y - 4, 56, 1, 0.8, sim.time);
      for (let i = 0; i < 3; i++) {
        const x = ((sim.time * 60 + i * 120) % 420) - 30;
        line(c, x, 80 + i * 40, x + 28, 80 + i * 40, C.cool, 3, 0.6);
      }
    }
  });
  env.layer(c, 'sun', () => { sun(c, 312, 52, sunV, sim.time); });

  const puddle = (k: 0 | 1, box: { x0: number; x1: number }) => {
    const w = sim.puddleWidth(k);
    if (w <= 0) return;
    const cx = (box.x0 + box.x1) / 2;
    ellipse(c, cx, ROAD_Y + 6, w / 2, 7 + 2 * sim.water[k], C.sea, C.ink, 2, 0.9);
    ellipse(c, cx - w * 0.15, ROAD_Y + 4, w * 0.18, 1.6, '#FFFFFF', null, 0, 0.6);
  };
  env.layer(c, 'puddle_A', () => puddle(0, PUDDLE_A));
  env.layer(c, 'puddle_B', () => puddle(1, PUDDLE_B));
  if (shade) env.layer(c, 'bg', () => { c.drawRect(R(200, ROAD_Y - 90, 100, 120), fillPaint('#6B7280', 0.25)); });

  // Wisps: faint dotted vapour rising and fading (never sinking, never a sun beam).
  const w = sim.wisps;
  const drawWisps = (which: number) => {
    for (let i = 0; i < w.size; i++) {
      if (!w.active[i] || w.c[i] !== which) continue;
      wisp(c, w.x[i], w.y[i], w.a[i] / w.b[i]);
    }
  };
  env.layer(c, 'vapour_A', () => drawWisps(0));
  env.layer(c, 'vapour_B', () => drawWisps(1));

  if (w.count > 0) {
    if (!firstWisp.has(sim) || (firstWisp.get(sim) ?? 0) > sim.time) firstWisp.set(sim, sim.time);
    if (sim.time - (firstWisp.get(sim) ?? 0) < 6) env.layer(c, 'vapour_A', () => label(c, env.font, 'vapour (really invisible)', 110, ROAD_Y - 120));
  }
  env.layer(c, 'bg', () => {
    label(c, env.font, 'sunny puddle', 110, ROAD_Y + 34);
    label(c, env.font, shade ? 'shady puddle' : 'puddle B', 250, ROAD_Y + 34);
    if (sim.goneAt[0] > 0 && sim.water[0] === 0) { circle(c, 110, ROAD_Y + 4, 3, '#C9C2B2', null, 0); label(c, env.font, 'all gone: it went into the air', 110, ROAD_Y + 64); }
  });
};

export const evapBounds: Bounds<EvapSim> = (_s, layer) => {
  if (layer === 'vapour_A' || layer === 'puddle_A') return [PUDDLE_A.x0 - 24, 250, PUDDLE_A.x1 - PUDDLE_A.x0 + 48, 160];
  if (layer === 'vapour_B' || layer === 'puddle_B') return [PUDDLE_B.x0 - 24, 250, PUDDLE_B.x1 - PUDDLE_B.x0 + 48, 160];
  return null;
};
export const evapSummary = (s: EvapSim) => `Sunny puddle ${Math.round(s.water[0] * 100)} percent full. Shady puddle ${Math.round(s.water[1] * 100)} percent full.`;
export const evapInteraction = (_s: EvapSim): Interaction | null => null;
