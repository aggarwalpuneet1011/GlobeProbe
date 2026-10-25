// Node stand-in for @shopify/react-native-skia: records draw calls and throws on non-finite numbers.
export const calls = { n: 0, text: [] as string[] };
const finite = (name: string, args: unknown[]) => {
  for (const a of args) {
    if (typeof a === 'number' && !Number.isFinite(a)) throw new Error(`${name}: non-finite argument ${a} in (${args.map((x) => (typeof x === 'object' ? '{}' : String(x))).join(', ')})`);
    if (a && typeof a === 'object' && !Array.isArray(a)) for (const v of Object.values(a as Record<string, unknown>)) if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`${name}: non-finite field ${v}`);
  }
};
const rec = (name: string) => (...args: unknown[]) => { finite(name, args); calls.n++; };
export const PaintStyle = { Fill: 0, Stroke: 1 };
export const StrokeCap = { Butt: 0, Round: 1, Square: 2 };
export const StrokeJoin = { Miter: 0, Round: 1, Bevel: 2 };
export const ClipOp = { Difference: 0, Intersect: 1 };

class Paint {
  setAntiAlias() {} setColor() {} setAlphaf(a: number) { finite('alpha', [a]); if (a < 0 || a > 1.0001) throw new Error('alpha out of range ' + a); }
  setStyle() {} setStrokeWidth(w: number) { finite('strokeWidth', [w]); } setStrokeCap() {} setStrokeJoin() {} setPathEffect() {}
}
class Path {
  moveTo = rec('moveTo'); lineTo = rec('lineTo'); cubicTo = rec('cubicTo'); quadTo = rec('quadTo'); close = rec('close'); addArc = rec('addArc'); addCircle = rec('addCircle');
}
export const Skia = {
  Paint: () => new Paint(),
  Color: (s: string) => s,
  XYWHRect: (x: number, y: number, w: number, h: number) => { finite('rect', [x, y, w, h]); return { x, y, width: w, height: h }; },
  RRectXY: (r: unknown, rx: number, ry: number) => { finite('rrect', [rx, ry]); return { rect: r, rx, ry }; },
  Path: { Make: () => new Path() },
  PathEffect: { MakeDash: (d: number[]) => d },
};
export class MockCanvas {
  drawCircle = rec('drawCircle'); drawRect = rec('drawRect'); drawRRect = rec('drawRRect'); drawOval = rec('drawOval'); drawLine = rec('drawLine');
  drawPath = rec('drawPath'); drawArc = rec('drawArc');
  drawText = (t: string, x: number, y: number) => { finite('drawText', [x, y]); calls.n++; calls.text.push(t); };
  save = rec('save'); restore = rec('restore'); translate = rec('translate'); rotate = rec('rotate'); scale = rec('scale'); saveLayer = rec('saveLayer'); clipRect = rec('clipRect');
}
export const mockFont = { measureText: (t: string) => ({ width: t.length * 7, height: 13 }), getSize: () => 13 };
// Components are not used in node tests.
export const Canvas = () => null; export const Group = () => null; export const Picture = () => null; export const Path_ = () => null;
export const useFont = () => null;
