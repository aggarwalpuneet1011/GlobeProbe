import React, { useMemo } from 'react';
import { Image, View } from 'react-native';
import { Canvas, Circle, Group, Line, Oval, Path, Rect, RoundedRect, Skia, Text as SkText, useFont, vec } from '@shopify/react-native-skia';
import type { SceneElement } from '../types';
import { iconSource } from '../ui/Icon';
import { C } from '../ui/theme';

const MAP_W = 320, MAP_H = 200;
const nunito = require('@expo-google-fonts/nunito/700Bold/Nunito_700Bold.ttf');

function polyPath(pts: number[]) {
  const p = Skia.Path.Make();
  for (let i = 0; i < pts.length; i += 2) (i ? p.lineTo(pts[i], pts[i + 1]) : p.moveTo(pts[i], pts[i + 1]));
  p.close();
  return p;
}
function arrowParts(x1: number, y1: number, x2: number, y2: number) {
  const ang = Math.atan2(y2 - y1, x2 - x1); const h = 11;
  const head = Skia.Path.Make();
  head.moveTo(x2, y2);
  head.lineTo(x2 - h * Math.cos(ang - 0.5), y2 - h * Math.sin(ang - 0.5));
  head.lineTo(x2 - h * Math.cos(ang + 0.5), y2 - h * Math.sin(ang + 0.5));
  head.close();
  return head;
}

/** The little stylised map of a Case File, drawn from the case JSON's scene elements. 320 x 200 units scaled to the width. */
export function CaseMap({ elements, width, caption }: { elements: SceneElement[]; width: number; caption: string }) {
  const s = width / MAP_W; const height = MAP_H * s;
  const font = useFont(nunito, 13);
  const fontBig = useFont(nunito, 15);
  const nodes = useMemo(() => elements.map((e, i) => {
    switch (e.t) {
      case 'rect': return (
        <React.Fragment key={i}>
          <RoundedRect x={e.x} y={e.y} width={e.w} height={e.h} r={e.r ?? 0} color={e.fill} opacity={e.opacity ?? 1} />
          {e.stroke ? <RoundedRect x={e.x} y={e.y} width={e.w} height={e.h} r={e.r ?? 0} color={e.stroke} style="stroke" strokeWidth={2} /> : null}
        </React.Fragment>
      );
      case 'poly': { const p = polyPath(e.pts); return <React.Fragment key={i}><Path path={p} color={e.fill} />{e.stroke ? <Path path={p} color={e.stroke} style="stroke" strokeWidth={2} strokeJoin="round" /> : null}</React.Fragment>; }
      case 'ellipse': return <React.Fragment key={i}><Oval x={e.cx - e.rx} y={e.cy - e.ry} width={e.rx * 2} height={e.ry * 2} color={e.fill} />{e.stroke ? <Oval x={e.cx - e.rx} y={e.cy - e.ry} width={e.rx * 2} height={e.ry * 2} color={e.stroke} style="stroke" strokeWidth={2} /> : null}</React.Fragment>;
      case 'circle': return <React.Fragment key={i}><Circle cx={e.cx} cy={e.cy} r={e.r} color={e.fill} />{e.stroke ? <Circle cx={e.cx} cy={e.cy} r={e.r} color={e.stroke} style="stroke" strokeWidth={2} /> : null}</React.Fragment>;
      case 'tri': { const p = polyPath([e.cx, e.by - e.h, e.cx + e.w / 2, e.by, e.cx - e.w / 2, e.by]); return <React.Fragment key={i}><Path path={p} color={e.fill} /><Path path={p} color={C.ink} style="stroke" strokeWidth={1.5} strokeJoin="round" /></React.Fragment>; }
      case 'line': return <Line key={i} p1={vec(e.x1, e.y1)} p2={vec(e.x2, e.y2)} color={e.stroke} strokeWidth={2} />;
      case 'arrow': return (
        <React.Fragment key={i}>
          <Line p1={vec(e.x1, e.y1)} p2={vec(e.x2, e.y2)} color={C.ink} strokeWidth={7} strokeCap="round" />
          <Line p1={vec(e.x1, e.y1)} p2={vec(e.x2, e.y2)} color={e.color} strokeWidth={4} strokeCap="round" />
          <Path path={arrowParts(e.x1, e.y1, e.x2, e.y2)} color={e.color} />
          <Path path={arrowParts(e.x1, e.y1, e.x2, e.y2)} color={C.ink} style="stroke" strokeWidth={1.5} strokeJoin="round" />
        </React.Fragment>
      );
      case 'label': {
        const f = (e.size ?? 13) > 14 ? fontBig : font;
        if (!f) return null;
        const w = f.measureText(e.text).width;
        const x = e.anchor === 'middle' ? e.x - w / 2 : e.anchor === 'end' ? e.x - w : e.x;
        return (
          <React.Fragment key={i}>
            <SkText x={x} y={e.y} text={e.text} font={f} color={C.cream} style="stroke" strokeWidth={4} />
            <SkText x={x} y={e.y} text={e.text} font={f} color={C.ink} />
          </React.Fragment>
        );
      }
      default: return null;
    }
  }), [elements, font, fontBig]);
  const icons = elements.filter((e): e is Extract<SceneElement, { t: 'icon' }> => e.t === 'icon');
  return (
    <View accessible accessibilityLabel={`Map. ${caption}`} style={{ width, height, borderRadius: 20, overflow: 'hidden', borderWidth: 2, borderColor: C.ink }}>
      <Canvas style={{ width, height }}>
        <Rect x={0} y={0} width={width} height={height} color={C.sky} />
        <Group transform={[{ scale: s }]}>{nodes}</Group>
      </Canvas>
      {icons.map((e, i) => {
        const src = iconSource(e.name);
        return src ? <Image key={i} source={src} style={{ position: 'absolute', left: e.x * s, top: e.y * s, width: e.size * s, height: e.size * s }} resizeMode="contain" /> : null;
      })}
    </View>
  );
}

