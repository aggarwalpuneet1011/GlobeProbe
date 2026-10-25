// Imperative Skia drawing kit for the sims: flat shapes, 2-unit ink outlines, rounded joins.
// Paints are cached; nothing here allocates per shape except small paths.
import { ClipOp, PaintStyle, Skia, StrokeCap, StrokeJoin, type SkCanvas, type SkFont, type SkPaint, type SkPath } from '@shopify/react-native-skia';
import { C } from '../../ui/theme';
import { lerpColor, WARM, COOL } from '../engine';

export const INK: string = C.ink;
export const CREAM: string = C.cream;
export const W = 360;
export const H = 480;

const fills = new Map<string, SkPaint>();
const strokes = new Map<string, SkPaint>();

export function fillPaint(hex: string, a = 1): SkPaint {
  const key = `${hex}|${a.toFixed(2)}`;
  let p = fills.get(key);
  if (!p) { p = Skia.Paint(); p.setAntiAlias(true); p.setColor(Skia.Color(hex)); p.setAlphaf(a); p.setStyle(PaintStyle.Fill); fills.set(key, p); }
  return p;
}
export function strokePaint(hex: string, w = 2, a = 1, dash?: number[]): SkPaint {
  const key = `${hex}|${w}|${a.toFixed(2)}|${dash ? dash.join(',') : ''}`;
  let p = strokes.get(key);
  if (!p) {
    p = Skia.Paint(); p.setAntiAlias(true); p.setColor(Skia.Color(hex)); p.setAlphaf(a); p.setStyle(PaintStyle.Stroke);
    p.setStrokeWidth(w); p.setStrokeCap(StrokeCap.Round); p.setStrokeJoin(StrokeJoin.Round);
    if (dash) p.setPathEffect(Skia.PathEffect.MakeDash(dash, 0));
    strokes.set(key, p);
  }
  return p;
}
const layerPaint = new Map<string, SkPaint>();
export function alphaLayer(a: number): SkPaint {
  const k = a.toFixed(2);
  let p = layerPaint.get(k);
  if (!p) { p = Skia.Paint(); p.setAlphaf(a); layerPaint.set(k, p); }
  return p;
}

export const R = (x: number, y: number, w: number, h: number) => Skia.XYWHRect(x, y, w, h);

// ---------------------------------------------------------------- shapes
export function circle(c: SkCanvas, x: number, y: number, r: number, fill?: string, stroke: string | null = INK, sw = 2, a = 1) {
  if (fill) c.drawCircle(x, y, r, fillPaint(fill, a));
  if (stroke) c.drawCircle(x, y, r, strokePaint(stroke, sw, a));
}
export function rect(c: SkCanvas, x: number, y: number, w: number, h: number, fill?: string, stroke: string | null = INK, sw = 2, rad = 0, a = 1) {
  const r = rad > 0 ? Skia.RRectXY(R(x, y, w, h), rad, rad) : null;
  if (fill) { if (r) c.drawRRect(r, fillPaint(fill, a)); else c.drawRect(R(x, y, w, h), fillPaint(fill, a)); }
  if (stroke) { if (r) c.drawRRect(r, strokePaint(stroke, sw, a)); else c.drawRect(R(x, y, w, h), strokePaint(stroke, sw, a)); }
}
export function ellipse(c: SkCanvas, cx: number, cy: number, rx: number, ry: number, fill?: string, stroke: string | null = INK, sw = 2, a = 1) {
  const r = R(cx - rx, cy - ry, rx * 2, ry * 2);
  if (fill) c.drawOval(r, fillPaint(fill, a));
  if (stroke) c.drawOval(r, strokePaint(stroke, sw, a));
}
export function line(c: SkCanvas, x0: number, y0: number, x1: number, y1: number, col = INK, w = 2, a = 1, dash?: number[]) {
  c.drawLine(x0, y0, x1, y1, strokePaint(col, w, a, dash));
}
export function poly(c: SkCanvas, pts: number[], fill?: string, stroke: string | null = INK, sw = 2, a = 1, closed = true) {
  const p = Skia.Path.Make();
  p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  if (closed) p.close();
  if (fill) c.drawPath(p, fillPaint(fill, a));
  if (stroke) c.drawPath(p, strokePaint(stroke, sw, a));
}
export function path(c: SkCanvas, p: SkPath, fill?: string, stroke: string | null = INK, sw = 2, a = 1) {
  if (fill) c.drawPath(p, fillPaint(fill, a));
  if (stroke) c.drawPath(p, strokePaint(stroke, sw, a));
}

// ---------------------------------------------------------------- text
/**
 * World label: Nunito 700 in ink on a soft cream pill. A stroked-text halo turned to blobs once the canvas was scaled up
 * on a phone (FEEDBACK #1), so legibility now comes from a rounded backing plate. The plate is clamped inside the canvas.
 */
export function label(c: SkCanvas, font: SkFont | null, text: string, x: number, y: number, anchor: 'start' | 'middle' | 'end' = 'middle', col = INK) {
  if (!font) return;
  const w = font.measureText(text).width;
  const size = font.getSize();
  const padX = 6;
  let px = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  px = Math.max(padX + 3, Math.min(W - w - padX - 3, px));
  const top = y - size * 0.95 - 3;
  const h = size * 1.25 + 6;
  rect(c, px - padX, top, w + padX * 2, h, CREAM, null, 0, h / 2, 0.9);
  c.drawText(text, px, y, fillPaint(col), font);
}

// ---------------------------------------------------------------- shared encodings
const DOT_OFFS: [number, number][] = [[-3.5, -2], [3, -3.5], [0, 1], [-3.5, 4], [3.5, 3.2]];
/** Air parcel: radius 9 (or `r`), ink stroke, fill by temperature, 0..5 moisture dots in Sea blue, and an up/down arrow so it is never colour-only. */
export function parcel(c: SkCanvas, x: number, y: number, coolness: number, moisture: number, r = 9, motion: 'up' | 'down' | null = null, a = 1) {
  const q = Math.round(Math.max(0, Math.min(1, coolness)) * 24) / 24;
  circle(c, x, y, r, lerpColor(WARM, COOL, q), INK, 2, a);
  const n = Math.round(Math.max(0, Math.min(1, moisture)) * 5);
  const k = r / 9;
  for (let i = 0; i < n; i++) c.drawCircle(x + DOT_OFFS[i][0] * k, y + DOT_OFFS[i][1] * k, 1.5 * k, fillPaint(C.sea, a));
  if (motion) {
    const dy = motion === 'up' ? -1 : 1;
    const ax = x, ay = y + dy * (r + 5);
    poly(c, [ax, ay + dy * 3, ax - 3.5, ay - dy * 2, ax + 3.5, ay - dy * 2], INK, INK, 1, a);
  }
}

/** Cloud: 3 to 5 overlapping white circles. Outline is the union (strokes first, fills on top). Turns Raincloud grey when raining. */
export function cloud(c: SkCanvas, cx: number, cy: number, size: number, rainy = false, a = 1, puffs = 4) {
  if (size <= 0.5) return;
  const fillc = rainy ? C.raincloud : '#FFFFFF';
  const offs: [number, number, number][] = [[-0.9, 0.2, 0.62], [-0.3, -0.35, 0.8], [0.4, -0.25, 0.72], [1.0, 0.2, 0.58], [0.05, 0.3, 0.7]];
  const n = Math.max(3, Math.min(5, puffs));
  for (let i = 0; i < n; i++) c.drawCircle(cx + offs[i][0] * size * 0.55, cy + offs[i][1] * size * 0.55, offs[i][2] * size * 0.55, strokePaint(INK, 4, a));
  for (let i = 0; i < n; i++) c.drawCircle(cx + offs[i][0] * size * 0.55, cy + offs[i][1] * size * 0.55, offs[i][2] * size * 0.55, fillPaint(fillc, a));
}

/** Teardrop in Sea blue, size by type. (x, y) is the bottom centre. */
export function drop(c: SkCanvas, x: number, y: number, w: number, h: number, a = 1) {
  const p = Skia.Path.Make();
  p.moveTo(x, y - h);
  p.cubicTo(x + w * 0.2, y - h * 0.55, x + w * 0.5, y - h * 0.4, x + w * 0.5, y - h * 0.22);
  p.cubicTo(x + w * 0.5, y - h * 0.06, x + w * 0.25, y, x, y);
  p.cubicTo(x - w * 0.25, y, x - w * 0.5, y - h * 0.06, x - w * 0.5, y - h * 0.22);
  p.cubicTo(x - w * 0.5, y - h * 0.4, x - w * 0.2, y - h * 0.55, x, y - h);
  p.close();
  c.drawPath(p, fillPaint(C.sea, a));
  if (w >= 5) c.drawPath(p, strokePaint(INK, 1, a));
}

export function tree(c: SkCanvas, x: number, y: number, s = 1, a = 1) {
  rect(c, x - 1.5 * s, y - 8 * s, 3 * s, 8 * s, '#8B5A2B', INK, 1, 0, a);
  circle(c, x, y - 12 * s, 6.5 * s, C.greenDark, INK, 1.5, a);
  circle(c, x - 3 * s, y - 9 * s, 4 * s, C.green, null, 1, a);
}
export function bush(c: SkCanvas, x: number, y: number, s = 1, a = 1) {
  circle(c, x, y - 4 * s, 5 * s, C.green, INK, 1.5, a);
  circle(c, x + 5 * s, y - 3 * s, 4 * s, C.greenDark, INK, 1.5, a);
}
/** Crack lines so dry ground is never colour-only. */
export function cracks(c: SkCanvas, x0: number, x1: number, y: number, a = 1) {
  const w = x1 - x0;
  const p = Skia.Path.Make();
  p.moveTo(x0 + w * 0.15, y + 3); p.lineTo(x0 + w * 0.3, y + 8); p.lineTo(x0 + w * 0.42, y + 5); p.lineTo(x0 + w * 0.55, y + 11);
  p.moveTo(x0 + w * 0.3, y + 8); p.lineTo(x0 + w * 0.26, y + 13);
  p.moveTo(x0 + w * 0.62, y + 4); p.lineTo(x0 + w * 0.76, y + 9); p.lineTo(x0 + w * 0.86, y + 6);
  c.drawPath(p, strokePaint(C.ochreDark, 1.4, a));
}

/** Arrow from (x0,y0) to (x1,y1): Cool blue with ink outline. Always points the way the air moves. */
export function arrow(c: SkCanvas, x0: number, y0: number, x1: number, y1: number, thick = 6, fill: string = C.cool, a = 1) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const head = Math.min(len * 0.5, thick * 2.2 + 4);
  const bx = x1 - ux * head, by = y1 - uy * head;
  poly(c, [
    x0 + nx * thick / 2, y0 + ny * thick / 2, bx + nx * thick / 2, by + ny * thick / 2, bx + nx * (thick / 2 + head * 0.42), by + ny * (thick / 2 + head * 0.42),
    x1, y1,
    bx - nx * (thick / 2 + head * 0.42), by - ny * (thick / 2 + head * 0.42), bx - nx * thick / 2, by - ny * thick / 2, x0 - nx * thick / 2, y0 - ny * thick / 2,
  ], fill, INK, 2, a);
}

export function sun(c: SkCanvas, x: number, y: number, strength: number, t = 0) {
  const s = Math.max(0, Math.min(3, strength));
  const r = 16 + s * 2;
  if (s > 0) {
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 + t * 0.15;
      const l0 = r + 3, l1 = r + 5 + s * 3.5;
      line(c, x + Math.cos(ang) * l0, y + Math.sin(ang) * l0, x + Math.cos(ang) * l1, y + Math.sin(ang) * l1, INK, 2);
    }
  }
  circle(c, x, y, r, s === 0 ? '#D8D8CC' : C.sun, INK, 2);
}

export function moon(c: SkCanvas, x: number, y: number) {
  circle(c, x, y, 15, '#FFF3C4', INK, 2);
  circle(c, x + 7, y - 4, 12, '#2E3470', null, 0);
}

/** Dotted wisps (Cool blue, 45% opacity), really invisible vapour. */
export function wisp(c: SkCanvas, x: number, y: number, k: number, a = 1) {
  const o = 0.45 * a * (1 - k);
  c.drawCircle(x, y, 2.4, fillPaint(C.cool, o));
  c.drawCircle(x + 3, y - 4, 1.8, fillPaint(C.cool, o));
  c.drawCircle(x - 2.5, y - 8, 1.4, fillPaint(C.cool, o));
}

export function thermometer(c: SkCanvas, font: SkFont | null, x: number, y: number, h: number, fill: number, text: string, col: string = C.coral) {
  rect(c, x - 4, y, 8, h, '#FFFFFF', INK, 2, 4);
  const fh = Math.max(3, h * Math.max(0, Math.min(1, fill)));
  rect(c, x - 2.5, y + h - fh, 5, fh, col, null, 0, 2);
  circle(c, x, y + h + 4, 7, col, INK, 2);
  label(c, font, text, x + 12, y + h * 0.5 + 4, 'start');
}

/** Generic kid in a raincoat: faceless, simple. open umbrella optional. */
export function kid(c: SkCanvas, x: number, y: number, umbrella: 'open' | 'closed' | 'none', bob = 0) {
  const yy = y + bob;
  rect(c, x - 5, yy - 26, 10, 16, '#F2B134', INK, 2, 4);                   // raincoat
  circle(c, x, yy - 31, 5.5, '#F3C9A0', INK, 2);                            // head
  rect(c, x - 4, yy - 10, 3, 10, '#2E3470', INK, 1.5);                      // legs
  rect(c, x + 1, yy - 10, 3, 10, '#2E3470', INK, 1.5);
  rect(c, x - 9, yy - 24, 5, 10, '#3FAE5A', INK, 1.5, 2);                   // school bag
  if (umbrella === 'open') {
    line(c, x + 7, yy - 24, x + 7, yy - 46, INK, 2);
    const p = Skia.Path.Make();
    p.moveTo(x - 12, yy - 46); p.cubicTo(x - 8, yy - 62, x + 22, yy - 62, x + 26, yy - 46); p.close();
    path(c, p, C.coral, INK, 2);
  } else if (umbrella === 'closed') {
    line(c, x + 8, yy - 30, x + 8, yy - 8, INK, 3);
    line(c, x + 8, yy - 30, x + 8, yy - 20, C.coral, 3);
  }
}

export function building(c: SkCanvas, x: number, y: number, w: number, h: number, fill = '#E8D5B5') {
  rect(c, x, y - h, w, h, fill, INK, 2);
  for (let r = 0; r < Math.floor(h / 26); r++) for (let k = 0; k < Math.floor(w / 24); k++) rect(c, x + 8 + k * 22, y - h + 10 + r * 24, 10, 12, '#BFE6FF', INK, 1.5);
}

export function flag(c: SkCanvas, x: number, y: number, h: number, dirX: number, strength: number, t: number) {
  line(c, x, y, x, y - h, INK, 3);
  const droop = strength < 0.05;
  const p = Skia.Path.Make();
  const len = droop ? 14 : 16 + strength * 18;
  const flutter = Math.sin(t * 8) * 2.5 * (droop ? 0.1 : strength);
  if (droop) { p.moveTo(x, y - h); p.lineTo(x + 8, y - h + 4); p.lineTo(x + 6, y - h + 16); p.lineTo(x, y - h + 14); }
  else { p.moveTo(x, y - h); p.lineTo(x + dirX * len, y - h + 2 + flutter); p.lineTo(x + dirX * (len - 3), y - h + 14 - flutter); p.lineTo(x, y - h + 14); }
  p.close();
  path(c, p, C.coral, INK, 2);
}

export function kite(c: SkCanvas, x: number, y: number, rot: number) {
  c.save(); c.translate(x, y); c.rotate((rot * 180) / Math.PI, 0, 0);
  poly(c, [0, -11, 8, 0, 0, 12, -8, 0], C.sun, INK, 2);
  line(c, 0, -11, 0, 12, INK, 1.2); line(c, -8, 0, 8, 0, INK, 1.2);
  c.restore();
}

export function clipTo(c: SkCanvas, x: number, y: number, w: number, h: number) { c.clipRect(R(x, y, w, h), ClipOp.Intersect, true); }

export { lerpColor, WARM, COOL };
