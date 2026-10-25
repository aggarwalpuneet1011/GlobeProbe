import type { SkCanvas } from '@shopify/react-native-skia';
import { Skia } from '@shopify/react-native-skia';
import { BreezeSim, N_PARCELS, SEA_TEMP, breezeDelta, isNight, skyAt } from '../breeze';
import { C } from '../../ui/theme';
import type { Bounds, Renderer } from './SimView';
import { arrow, circle, ellipse, fillPaint, flag, kite, label, line, moon, parcel, path, rect, strokePaint, sun, thermometer, W, H, R } from './kit';
import { fmtHours } from '../../util/time';

const SURFACE_Y = 360;
const SEA_X = 170;

export const renderBreeze: Renderer<BreezeSim> = (c: SkCanvas, sim, env) => {
  const h = sim.hours;
  const mode = sim.mode;
  const delta = breezeDelta(h);
  env.layer(c, 'bg', () => {
    c.drawRect(R(0, 0, W, H), fillPaint(skyAt(h)));
    // sun or moon crossing the sky
    const k = (h - 6) / 24;
    const sx = 20 + (k % 1) * 320;
    const sy = 190 - Math.sin(((h - 6) / 12) * Math.PI) * 130;
    if (isNight(h)) moon(c, 60 + ((h - 19.5) / 9.5) * 240, 70 + Math.abs(Math.sin(((h - 19.5) / 9.5) * Math.PI)) * -20 + 20);
    else if (h < 19.5) sun(c, Math.min(340, Math.max(20, sx)), Math.max(60, sy), h > 8 && h < 17 ? 3 : 1.5, env.t);
    // sea
    const sea = Skia.Path.Make();
    sea.moveTo(0, SURFACE_Y);
    for (let x = 0; x <= SEA_X; x += 17) sea.lineTo(x, SURFACE_Y + Math.sin(env.t * 2 + x * 0.12) * 2);
    sea.lineTo(SEA_X, H); sea.lineTo(0, H); sea.close();
    path(c, sea, C.sea, C.ink, 2);
    // sand and land
    const sand = Skia.Path.Make();
    sand.moveTo(SEA_X, SURFACE_Y); sand.lineTo(W, SURFACE_Y); sand.lineTo(W, H); sand.lineTo(SEA_X - 6, H); sand.close();
    path(c, sand, C.sand, C.ink, 2);
    label(c, env.font, 'sea', 80, SURFACE_Y + 40); label(c, env.font, 'sand', 270, SURFACE_Y + 40);
    // palm tree hint
    line(c, 335, SURFACE_Y, 330, SURFACE_Y - 50, '#8B5A2B', 4);
    circle(c, 330, SURFACE_Y - 54, 12, C.green, C.ink, 2);
    // orange glow above the hot sand (midday), cool tint at night
    if (delta > 0) for (let i = 0; i < 4; i++) ellipse(c, 270, SURFACE_Y - 14 - i * 12, 90 - i * 12, 12, C.warm, null, 0, Math.min(0.32, (delta / 5) * 0.32) * (1 - i * 0.2));
    else if (delta < -1) ellipse(c, 270, SURFACE_Y - 14, 80, 12, C.cool, null, 0, Math.min(0.3, (-delta / 5) * 0.3));
  });
  // Thermometers with numbers.
  env.layer(c, 'bg', () => {
    thermometer(c, env.font, 100, 230, 60, (SEA_TEMP - 20) / 16, `${SEA_TEMP}°C`, C.sea);
    thermometer(c, env.font, 250, 230, 60, (sim.landTemp - 20) / 16, `${sim.landTemp.toFixed(1)}°C`, delta > 0 ? C.coral : C.cool);
    label(c, env.font, 'sea', 100, 222); label(c, env.font, 'sand', 250, 222);
    rect(c, 12, 12, 120, 30, '#FFFFFF', C.ink, 2, 14);
    label(c, env.font, fmtHours(h), 72, 33);
  });
  // Flag and kite show the surface wind.
  const dirX = mode === 'sea' ? 1 : mode === 'land' ? -1 : 0;
  const strength = mode === 'calm' ? 0 : Math.min(1, Math.abs(delta) / 5);
  env.layer(c, 'bg', () => {
    flag(c, 300, SURFACE_Y, 56, dirX || 1, strength, env.t);
    const kx = 230 + dirX * 30 * strength, ky = 120 + Math.sin(env.t * 2) * 3;
    line(c, 230, SURFACE_Y, kx, ky + 12, C.ink, 1, 0.8);
    kite(c, kx, ky, dirX * 0.4 + Math.sin(env.t * 3) * 0.08);
  });

  // Loop of 6 parcels: low across from cool to warm, up, back across high, down.
  env.layer(c, 'parcels_loop', () => {
    for (let i = 0; i < N_PARCELS; i++) {
      const x = sim.px[i], y = sim.py[i];
      let motion: 'up' | 'down' | null = null;
      if (mode !== 'calm') {
        if (Math.abs(x - 270) < 4 && y > 195 && y < 355) motion = mode === 'sea' ? 'up' : 'down';
        else if (Math.abs(x - 70) < 4 && y > 195 && y < 355) motion = mode === 'sea' ? 'down' : 'up';
      }
      parcel(c, x, y, sim.cool[i], 0.4, 9, motion);
    }
    if (mode !== 'calm') {
      // Low arrow shows the surface wind direction; thickness 4..12.
      const t = sim.arrowThickness;
      if (mode === 'sea') arrow(c, 90, 340, 250, 340, t); else arrow(c, 250, 340, 90, 340, t);
    }
  });
  env.layer(c, 'bg', () => {
    rect(c, 20, 428, 320, 38, '#FFFFFF', C.ink, 2, 14);
    label(c, env.font, sim.label, 180, 452);
  });
};

export const breezeBounds: Bounds<BreezeSim> = (_s, layer) => (layer === 'parcels_loop' ? [48, 170, 250, 210] : null);
export const breezeSummary = (s: BreezeSim) => `${fmtHours(s.hours)}. Sand ${s.landTemp.toFixed(0)} degrees, sea ${SEA_TEMP} degrees. ${s.label}.`;
