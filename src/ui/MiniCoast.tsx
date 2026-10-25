import React from 'react';
import { Canvas, Group, Path, Rect, Skia } from '@shopify/react-native-skia';
import { C } from './theme';
import { arrowRotation } from '../live/sky';

/** A mini Mumbai coastline (sea on the left) with a wind arrow that points where the wind is GOING (wind named by where it comes from). */
export function MiniCoast({ width, height, fromDeg, windKmh }: { width: number; height: number; fromDeg: number; windKmh: number }) {
  const cx = width / 2, cy = height / 2;
  const len = Math.min(width, height) * (0.28 + Math.min(windKmh, 40) / 40 * 0.2);
  const shaft = Skia.Path.Make();
  shaft.moveTo(0, len); shaft.lineTo(0, -len + 8);
  const head = Skia.Path.Make();
  head.moveTo(0, -len); head.lineTo(-11, -len + 16); head.lineTo(11, -len + 16); head.close();
  const coast = Skia.Path.Make();
  const sx = width * 0.42;
  coast.moveTo(0, 0); coast.lineTo(sx, 0);
  coast.cubicTo(sx - 14, height * 0.25, sx + 12, height * 0.5, sx - 6, height * 0.75);
  coast.lineTo(sx, height); coast.lineTo(0, height); coast.close();
  return (
    <Canvas style={{ width, height }} accessible accessibilityLabel="Wind arrow over the Mumbai coast">
      <Rect x={0} y={0} width={width} height={height} color={C.sand} />
      <Path path={coast} color={C.sky} />
      <Path path={coast} color={C.ink} style="stroke" strokeWidth={2} />
      <Group transform={[{ translateX: cx }, { translateY: cy }, { rotate: (arrowRotation(fromDeg) * Math.PI) / 180 }]}>
        <Path path={shaft} color={C.ink} style="stroke" strokeWidth={9} strokeCap="round" />
        <Path path={shaft} color={C.cool} style="stroke" strokeWidth={5} strokeCap="round" />
        <Path path={head} color={C.cool} />
        <Path path={head} color={C.ink} style="stroke" strokeWidth={2.5} strokeJoin="round" />
      </Group>
    </Canvas>
  );
}
