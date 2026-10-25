import type { SkCanvas } from '@shopify/react-native-skia';
import { Skia } from '@shopify/react-native-skia';
import { CELLS, CELL_W, CLOUD_LINE_Y, GROUND_Y, LAND_X0, MUMBAI_X, MountainSim, PEAK_X, PUNE_X, groundY } from '../mountain';
import { C } from '../../ui/theme';
import type { Bounds, Interaction, Renderer } from './SimView';
import { arrow, bush, circle, cloud, cracks, drop, fillPaint, label, line, lerpColor, parcel, path, poly, rect, strokePaint, tree, W, H, R } from './kit';

/** Rain gauge: a tube that fills. */
function gauge(c: SkCanvas, x: number, y: number, fill: number) {
  rect(c, x - 6, y - 56, 12, 56, '#FFFFFF', C.ink, 2, 4);
  const f = Math.max(0, Math.min(1, fill)) * 52;
  if (f > 0.5) rect(c, x - 4.5, y - 2 - f, 9, f, C.sea, null, 0, 2);
  for (let i = 1; i < 4; i++) line(c, x + 6, y - 2 - i * 13, x + 10, y - 2 - i * 13, C.ink, 1.5);
}

export const renderMountain: Renderer<MountainSim> = (c: SkCanvas, sim, env) => {
  const Hh = sim.H;
  env.layer(c, 'bg', () => {
    c.drawRect(R(0, 0, W, H), fillPaint(C.sky));
    // sea
    const sea = Skia.Path.Make();
    sea.moveTo(0, GROUND_Y);
    for (let x = 0; x <= LAND_X0 + 2; x += 10) sea.lineTo(x, GROUND_Y + Math.sin(env.t * 2 + x * 0.2) * 2);
    sea.lineTo(LAND_X0 + 2, H); sea.lineTo(0, H); sea.close();
    path(c, sea, C.sea, C.ink, 2);
    // ground, 12 cells: dry ochre with cracks -> wet green with trees, by rain landed in the last 20 s
    for (let k = 0; k < CELLS; k++) {
      const x0 = LAND_X0 + k * CELL_W, x1 = x0 + CELL_W;
      const g = sim.cellGreen(k);
      const col = lerpColor(C.ochre, C.green, g);
      const y0 = groundY(x0, Hh), y1 = groundY(x1, Hh);
      poly(c, [x0, y0, x1, y1, x1, H, x0, H], col, null, 0);
    }
    const top = Skia.Path.Make();
    top.moveTo(LAND_X0, GROUND_Y);
    for (let x = LAND_X0; x <= 360; x += 4) top.lineTo(x, groundY(x, Hh));
    c.drawPath(top, strokePaint(C.ink, 2.5));
    line(c, LAND_X0, GROUND_Y, LAND_X0, H, C.ink, 2);
    for (let k = 0; k < CELLS; k++) {
      const x0 = LAND_X0 + k * CELL_W, x1 = x0 + CELL_W, g = sim.cellGreen(k);
      const mx = (x0 + x1) / 2, my = groundY(mx, Hh);
      if (g < 0.35) cracks(c, x0, x1, my + 2, 1 - g);
      if (g > 0.5) tree(c, mx, my + 1, 0.7 + g * 0.5);
      else if (g > 0.3) bush(c, mx, my + 1, 0.8);
    }
  });
  env.layer(c, 'bg', () => {
    // cloud line
    line(c, 6, CLOUD_LINE_Y, W - 6, CLOUD_LINE_Y, C.ink, 2, 0.8, [8, 6]);
    label(c, env.font, 'cloud line', 322, CLOUD_LINE_Y - 6);
    // cities and gauges
    label(c, env.font, 'Mumbai', MUMBAI_X, GROUND_Y - 62);
    circle(c, MUMBAI_X, GROUND_Y - 8, 4, C.coral, C.ink, 2);
    gauge(c, MUMBAI_X + 22, GROUND_Y - 2, Math.min(1, sim.mumbaiGauge));
    label(c, env.font, 'Pune', PUNE_X, groundY(PUNE_X, Hh) - 64);
    gauge(c, PUNE_X, groundY(PUNE_X, Hh) - 2, Math.min(1, sim.puneGauge));
    // wind arrow label: always named by where it comes FROM
    if (sim.wind === 'sea') { arrow(c, 14, 70, 96, 70, 9); label(c, env.font, 'Wind from the sea', 62, 50); }
    else if (sim.wind === 'land') { arrow(c, 346, 70, 264, 70, 9); label(c, env.font, 'Wind from the land', 296, 50); }
    else label(c, env.font, 'Wind off', 62, 50);
  });

  // Thin shower cloud over the plain (never from descending air).
  if (sim.showerCloud > 0.05) env.layer(c, 'parcels_windward', () => cloud(c, 330, 244, 46, true, sim.showerCloud, 4));

  env.layer(c, 'parcels_windward', () => {
    const P = sim.parcels;
    for (let i = 0; i < P.size; i++) {
      if (!P.active[i]) continue;
      const height = GROUND_Y - P.y[i];
      const climbing = !sim.isDescending(i);
      parcel(c, P.x[i], P.y[i], Math.max(0, Math.min(1, height / 200)), P.a[i], 9, sim.parcelDir[i] === 0 ? null : climbing && height > 6 ? 'up' : !climbing ? 'down' : null, sim.parcelAlpha[i]);
      if (sim.parcelTag[i] && !climbing) label(c, env.font, 'dry air', P.x[i], P.y[i] - 18);
    }
    const U = sim.puffs;
    for (let i = 0; i < U.size; i++) {
      if (!U.active[i]) continue;
      const k = U.a[i] / U.b[i];
      cloud(c, U.x[i], U.y[i], 34 * Math.min(1, k * 5), true, 1 - k * k * 0.7, 4);
    }
    const D = sim.drops;
    for (let i = 0; i < D.size; i++) if (D.active[i]) drop(c, D.x[i], D.y[i], 3.4, 5.5);
  });

  // Grab handle on the peak.
  env.layer(c, 'bg', () => {
    const py = groundY(PEAK_X, Hh);
    circle(c, PEAK_X, py - 2, 10, '#FFFFFF', C.ink, 2);
    poly(c, [PEAK_X, py - 10, PEAK_X - 4, py - 5, PEAK_X + 4, py - 5], C.ink, C.ink, 1);
    poly(c, [PEAK_X, py + 6, PEAK_X - 4, py + 1, PEAK_X + 4, py + 1], C.ink, C.ink, 1);
    if (Hh >= 1) label(c, env.font, 'mountain', PEAK_X, py - 18);
  });
};

export const mountainBounds: Bounds<MountainSim> = (_s, layer) => (layer === 'parcels_windward' ? [0, 190, 214, 230] : null);
export const mountainSummary = (s: MountainSim) => {
  const m = s.mumbaiGauge, p = s.puneGauge;
  const word = (v: number) => (v < 0.08 ? 'almost empty' : v < 0.35 ? 'low' : v < 0.7 ? 'medium' : 'high');
  return `Mumbai gauge ${word(m)}, Pune gauge ${word(p)}. Mountain height ${Math.round(s.H)}.`;
};
export const mountainInteraction = (s: MountainSim): Interaction => {
  const set = (_x: number, y: number) => s.setControl('H', GROUND_Y - y + 6);
  return { hit: (x, y) => Math.abs(x - PEAK_X) < 46 && Math.abs(y - (groundY(PEAK_X, s.H) - 4)) < 46, start: set, move: set };
};
