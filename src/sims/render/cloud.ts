import type { SkCanvas } from '@shopify/react-native-skia';
import { BIG_R, BIG_X, CLOUD_LINE_Y, CloudSim, SEA_Y, TOP_Y, coolnessAt, tempAt } from '../cloud';
import { C } from '../../ui/theme';
import type { Bounds, Interaction, Renderer } from './SimView';
import { circle, cloud, fillPaint, label, line, parcel, rect, sun, thermometer, W, H, R, strokePaint } from './kit';
import { Skia } from '@shopify/react-native-skia';

export const renderCloud: Renderer<CloudSim> = (c: SkCanvas, sim, env) => {
  const y = sim.controls.parcelY as number;
  const cool = coolnessAt(y);
  env.layer(c, 'bg', () => {
    c.drawRect(R(0, 0, W, H), fillPaint(C.sky));
    sun(c, 318, 46, sim.controls.sun as number, sim.time);
    // sea
    const sea = Skia.Path.Make();
    sea.moveTo(0, SEA_Y);
    for (let x = 0; x <= W; x += 20) sea.lineTo(x, SEA_Y + Math.sin(sim.time * 2 + x * 0.1) * 2.5);
    sea.lineTo(W, H); sea.lineTo(0, H); sea.close();
    c.drawPath(sea, fillPaint(C.sea)); c.drawPath(sea, strokePaint(C.ink, 2));
    // height scale on the left edge
    line(c, 22, TOP_Y, 22, SEA_Y, C.ink, 2);
    for (let i = 0; i <= 4; i++) { const yy = SEA_Y - (i / 4) * (SEA_Y - TOP_Y); line(c, 18, yy, 27, yy, C.ink, 2); }
    label(c, env.font, 'low', 38, SEA_Y - 6, 'start'); label(c, env.font, 'high', 38, TOP_Y + 4, 'start');
    // cloud line
    line(c, 40, CLOUD_LINE_Y, W - 6, CLOUD_LINE_Y, C.ink, 2, 0.85, [8, 6]);
    label(c, env.font, 'cloud line', W - 50, CLOUD_LINE_Y - 6);
  });
  // Thermometer: shows temperature falling as the parcel rises (cooling is the cause).
  env.layer(c, 'bg', () => {
    thermometer(c, env.font, 52, 80, 70, 1 - cool, `${Math.round(tempAt(y))}°C`, cool > 0.5 ? C.cool : C.coral);
    circle(c, 22, y, 5, cool > 0.5 ? C.cool : C.warm, C.ink, 2);
  });

  // Small parcels rise on their own with the sun.
  env.layer(c, 'bg', () => {
    const s = sim.small;
    for (let i = 0; i < s.size; i++) {
      if (!s.active[i]) continue;
      if (s.a[i] > 0.5) cloud(c, s.x[i], s.y[i], s.a[i] * 2.2);
      parcel(c, s.x[i], s.y[i], coolnessAt(s.y[i]), s.b[i], 9, 'up');
    }
  });

  env.layer(c, 'parcel_main', () => {
    if (sim.bigPuff > 0.5) {
      cloud(c, BIG_X, y, sim.bigPuff * 2.4, false, 1, 5);
      // vapour dots turn into visible droplets
      for (let i = 0; i < 6; i++) circle(c, BIG_X - 14 + i * 5.6, y + ((i % 2) ? 5 : -5), 2.2 + sim.bigPuff * 0.05, C.sea, C.ink, 1);
    }
    parcel(c, BIG_X, y, cool, sim.bigMoisture, BIG_R, null);
    if (sim.bigPuff <= 0.5) label(c, env.font, 'drag me', BIG_X, y + BIG_R + 16);
    if (sim.bigPuff > 6) label(c, env.font, 'droplets: it is a cloud', BIG_X, y - BIG_R - 32);
    else if (y < CLOUD_LINE_Y + 40 && y > CLOUD_LINE_Y) label(c, env.font, cool > 0.4 ? 'cooler air' : 'warm air', BIG_X, y - BIG_R - 10);
  });
};

export const cloudBounds: Bounds<CloudSim> = (s, layer) => {
  if (layer !== 'parcel_main') return null;
  const y = s.controls.parcelY as number;
  return [BIG_X - 56, y - 56, 112, 112];
};
export const cloudSummary = (s: CloudSim) => (s.bigPuff > 6 ? 'The big air bubble is above the cloud line, cool, and a cloud has formed.' : 'The big air bubble is below the cloud line. No cloud yet.');
export const cloudInteraction = (s: CloudSim): Interaction => ({
  hit: (x, y) => Math.abs(x - BIG_X) < 50 && Math.abs(y - (s.controls.parcelY as number)) < 50,
  move: (_x, y) => s.setControl('parcelY', y),
});
void rect;
