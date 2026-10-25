import type { SkCanvas } from '@shopify/react-native-skia';
import { Skia } from '@shopify/react-native-skia';
import { CAUSEWAY_TOP_M, METRE, TIDE_AMPLITUDE, TIDE_HOURS, TideSim, tideExtrema, tideLevel } from '../tide';
import { C } from '../../ui/theme';
import type { Bounds, Interaction, Renderer } from './SimView';
import { circle, fillPaint, label, line, path, poly, rect, strokePaint, W, H, R } from './kit';
import { fmtHours } from '../../util/time';

const MEAN_Y = 250;
const CHART = { x: 24, y: 384, w: 312, h: 64 };
const yFor = (m: number) => MEAN_Y - m * METRE;

export const renderTide: Renderer<TideSim> = (c: SkCanvas, sim, env) => {
  const lvl = sim.level;
  const hrs = sim.hours;
  env.layer(c, 'bg', () => {
    c.drawRect(R(0, 0, W, H), fillPaint(C.sky));
    // rocky shore on the left, with the dark wet band at the highest level reached so far
    poly(c, [0, 180, 40, 176, 70, 232, 90, 300, 90, 372, 0, 372], '#9AA5B1', C.ink, 2);
    // islet on the right with a small white building (no text, no religious symbols)
    poly(c, [238, 300, 246, 232, 270, 200, 322, 200, 346, 232, 360, 300, 360, 372, 238, 372], '#9AA5B1', C.ink, 2);
    rect(c, 262, 160, 60, 40, '#FFFFFF', C.ink, 2, 3);
    poly(c, [258, 160, 292, 138, 326, 160], '#F5F1E6', C.ink, 2);
    for (let i = 0; i < 3; i++) rect(c, 270 + i * 18, 172, 10, 28, '#BFE6FF', C.ink, 1.5, 4);
    // stone causeway
    const top = yFor(CAUSEWAY_TOP_M);
    rect(c, 80, top, 170, 11, '#C9C2B2', C.ink, 2);
    for (let x = 88; x < 248; x += 20) line(c, x, top + 2, x, top + 9, C.ink, 1.5);
  });
  // wet band
  env.layer(c, 'bg', () => {
    const ym = yFor(sim.maxLevelSoFar);
    if (sim.maxLevelSoFar > -2) rect(c, 0, ym - 3, 82, 8, '#4A5565', null, 0, 0, 0.55);
  });
  // water
  env.layer(c, 'waterline', () => {
    const y = yFor(lvl);
    const water = Skia.Path.Make();
    water.moveTo(0, y);
    for (let x = 0; x <= W; x += 15) water.lineTo(x, y + Math.sin(env.t * 2 + x * 0.15) * 1.5);
    water.lineTo(W, 372); water.lineTo(0, 372); water.close();
    c.drawPath(water, fillPaint(C.sea, 0.82));
    c.drawPath(water, strokePaint(C.ink, 2));
    label(c, env.font, sim.covered ? 'path under water' : 'path is dry', 165, top2() - 14);
  });
  // clock and day
  env.layer(c, 'bg', () => {
    rect(c, 110, 14, 140, 36, '#FFFFFF', C.ink, 2, 14);
    label(c, env.font, `Day ${hrs >= 24 ? 2 : 1} · ${fmtHours(hrs % 24)}`, 180, 38);
    label(c, env.font, `tide ${lvl >= 0 ? '+' : ''}${lvl.toFixed(1)} m`, 180, 70);
  });

  // 48-hour chart: Sea blue line, highs with an up-arrow, lows with a down-arrow, cursor at the current time.
  env.layer(c, 'bg', () => {
    rect(c, CHART.x - 6, CHART.y - 12, CHART.w + 12, CHART.h + 22, '#FFFFFF', C.ink, 2, 12);
    const px = (t: number) => CHART.x + (t / TIDE_HOURS) * CHART.w;
    const py = (m: number) => CHART.y + CHART.h / 2 - (m / TIDE_AMPLITUDE) * (CHART.h / 2 - 8);
    line(c, CHART.x, py(CAUSEWAY_TOP_M), CHART.x + CHART.w, py(CAUSEWAY_TOP_M), C.ink, 1, 0.5, [4, 4]);
    const p = Skia.Path.Make();
    for (let i = 0; i <= 96; i++) { const t = (i / 96) * TIDE_HOURS; const x = px(t), y = py(tideLevel(t, sim.tHigh0)); if (i === 0) p.moveTo(x, y); else p.lineTo(x, y); }
    c.drawPath(p, strokePaint(C.sea, 3));
    for (const e of tideExtrema(sim.tHigh0)) {
      const x = px(e.t);
      if (e.kind === 'high') poly(c, [x, py(2) - 11, x - 4, py(2) - 4, x + 4, py(2) - 4], C.ink, C.ink, 1);
      else poly(c, [x, py(-2) + 11, x - 4, py(-2) + 4, x + 4, py(-2) + 4], C.ink, C.ink, 1);
    }
    line(c, px(hrs), CHART.y - 6, px(hrs), CHART.y + CHART.h + 4, C.coral, 2.5);
    circle(c, px(hrs), py(lvl), 4.5, C.coral, C.ink, 1.5);
    label(c, env.font, 'next 2 days', 180, CHART.y + CHART.h + 21, 'middle');
  });
  function top2() { return yFor(CAUSEWAY_TOP_M); }
};

export const tideBounds: Bounds<TideSim> = (s, layer) => (layer === 'waterline' ? [0, yFor(s.level) - 26, 360, 56] : null);
export const tideSummary = (s: TideSim) => `Time ${fmtHours(s.hours % 24)}. The tide is ${s.level > 1.4 ? 'high' : s.level < -1.4 ? 'low' : 'in between'}. The path is ${s.covered ? 'under water' : 'dry'}.`;
export const tideInteraction = (s: TideSim): Interaction => {
  const set = (x: number) => s.setControl('time', Math.max(0, Math.min(TIDE_HOURS, ((x - CHART.x) / CHART.w) * TIDE_HOURS)));
  return { hit: (x, y) => y > CHART.y - 14, start: set, move: set };
};
void R;
