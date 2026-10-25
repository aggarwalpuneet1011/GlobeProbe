import type { SkCanvas } from '@shopify/react-native-skia';
import { Skia } from '@shopify/react-native-skia';
import { WindSim, windFromArrow, windLabel } from '../wind';
import { C } from '../../ui/theme';
import type { Bounds, Interaction, Renderer } from './SimView';
import { arrow, circle, fillPaint, flag, kite, label, line, path, poly, rect, strokePaint, W, H, R } from './kit';

export const CENTER = { x: 190, y: 235 };
const LEN = 56;
const rad = (deg: number) => (deg * Math.PI) / 180;
const vec = (bearing: number) => ({ x: Math.sin(rad(bearing)), y: -Math.cos(rad(bearing)) });

export const renderWind: Renderer<WindSim> = (c: SkCanvas, sim, env) => {
  const b = sim.arrow;
  const v = vec(b);
  env.layer(c, 'bg', () => {
    c.drawRect(R(0, 0, W, H), fillPaint('#E6D9B6'));
    // Arabian Sea (west, left)
    const sea = Skia.Path.Make();
    sea.moveTo(0, 0); sea.lineTo(140, 0);
    sea.cubicTo(120, 90, 175, 150, 140, 230); sea.cubicTo(115, 300, 170, 360, 150, H); sea.lineTo(0, H); sea.close();
    path(c, sea, C.sea, C.ink, 2);
    for (let i = 0; i < 6; i++) { const y = 40 + i * 70; line(c, 20 + (i % 2) * 30, y, 50 + (i % 2) * 30, y + 4, '#FFFFFF', 2, 0.7); }
    // Marine Drive curve
    const md = Skia.Path.Make();
    md.moveTo(150, 90); md.cubicTo(135, 170, 185, 220, 160, 300); md.cubicTo(145, 350, 175, 400, 160, 460);
    c.drawPath(md, strokePaint(C.ink, 13)); c.drawPath(md, strokePaint('#F5F1E6', 9));
    // land: a few blocks
    for (let i = 0; i < 4; i++) rect(c, 250 + (i % 2) * 40, 90 + i * 90, 36, 44, '#E8D5B5', C.ink, 2, 4);
    label(c, env.font, 'Arabian Sea', 62, 24);
    label(c, env.font, 'Marine Drive', 232, 330, 'middle');
    label(c, env.font, 'land', 300, 64);
    // compass rose, N at the top
    circle(c, 318, 52, 24, '#FFFFFF', C.ink, 2);
    poly(c, [318, 32, 313, 52, 323, 52], C.coral, C.ink, 1.5);
    poly(c, [318, 72, 313, 52, 323, 52], '#FFFFFF', C.ink, 1.5);
    label(c, env.font, 'N', 318, 28);
  });

  // Air streaks drifting the way the air moves.
  env.layer(c, 'bg', () => {
    for (let i = 0; i < 9; i++) {
      const k = (sim.phase * 0.35 + i / 9) % 1;
      const cx = 20 + ((i * 97) % 320) + v.x * (k - 0.5) * 150;
      const cy = 60 + ((i * 53) % 380) + v.y * (k - 0.5) * 150;
      line(c, cx, cy, cx + v.x * 18, cy + v.y * 18, '#FFFFFF', 2.5, 0.55 * Math.sin(k * 3.1416));
    }
  });
  // Flag and kite at Marine Drive stream the way the air moves.
  env.layer(c, 'bg', () => {
    flag(c, 168, 388, 50, v.x >= 0 ? 1 : -1, Math.max(0.4, Math.abs(v.x) + Math.abs(v.y) * 0.5), env.t);
    const kx = 214 + v.x * 38, ky = 400 + v.y * 38;
    line(c, 214, 400, kx, ky, C.ink, 1.2);
    kite(c, kx, ky, Math.atan2(v.x, -v.y) + Math.sin(env.t * 6) * 0.1);
    circle(c, 214, 400, 3, C.ink, null, 0);
  });

  env.layer(c, 'arrow_tail', () => {
    const tx = CENTER.x - v.x * LEN, ty = CENTER.y - v.y * LEN;
    const hx = CENTER.x + v.x * LEN, hy = CENTER.y + v.y * LEN;
    arrow(c, tx, ty, hx, hy, 14);
    // The tail is where the air comes FROM.
    circle(c, tx, ty, 7, env.flags.glowTail ? C.sun : C.coral, C.ink, 2);
    if (env.flags.glowTail) circle(c, tx, ty, 16 + Math.sin(env.t * 6) * 3, undefined, C.sun, 3, 0.9);
    circle(c, hx, hy, 6, '#FFFFFF', C.ink, 2, 0.9);
  });
  env.layer(c, 'bg', () => {
    rect(c, 60, 410, 240, 40, '#FFFFFF', C.ink, 2, 14);
    label(c, env.font, windLabel(sim.from), 180, 435);
  });
};

export const windBounds: Bounds<WindSim> = (s, layer) => {
  if (layer !== 'arrow_tail') return null;
  const v = vec(s.arrow);
  const tx = CENTER.x - v.x * LEN, ty = CENTER.y - v.y * LEN;
  return [tx - 30, ty - 30, 60, 60];
};
export const windSummary = (s: WindSim) => `${windLabel(s.from)}. The arrow shows where the air is going.`;
export const windInteraction = (s: WindSim): Interaction => {
  const set = (x: number, y: number) => {
    const dx = x - CENTER.x, dy = y - CENTER.y;
    if (Math.hypot(dx, dy) < 12) return;
    const toward = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    s.setControl('windFrom', windFromArrow(toward));
  };
  return {
    hit: (x, y) => {
      const v = vec(s.arrow);
      return Math.hypot(x - (CENTER.x + v.x * LEN), y - (CENTER.y + v.y * LEN)) < 44;
    },
    start: set, move: set,
  };
};
