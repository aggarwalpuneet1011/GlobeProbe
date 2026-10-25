import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { C } from './theme';
import { T } from './Text';
import { Icon } from './Icon';
import { usePrefs } from './prefs';
import { playSfx } from './sfx';
import { hapticMedium } from './haptics';

/** 88 dp rubber-stamp: concept icon with ring text. Thump: scale 1.4 to 1 in 220 ms + medium haptic. `half` = half-inked first Explain. */
export function Stamp({ icon, size = 88, animate = false, half = false, label = 'STAMPED', tilt = -12, compact = false }: { icon: string; size?: number; animate?: boolean; half?: boolean; label?: string; tilt?: number; compact?: boolean }) {
  const { reduceMotion } = usePrefs();
  const s = useRef(new Animated.Value(animate && !reduceMotion ? 1.4 : 1)).current;
  const op = useRef(new Animated.Value(animate && !reduceMotion ? 0 : 1)).current;
  useEffect(() => {
    if (!animate) return;
    playSfx('stamp'); hapticMedium();
    if (reduceMotion) return;
    Animated.parallel([
      Animated.timing(s, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(op, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  }, [animate, reduceMotion, s, op]);
  const ring = '#0B5F94';
  return (
    <Animated.View accessible accessibilityLabel={half ? 'Half stamp' : 'Stamped'} style={{ width: size, height: size, opacity: op, transform: [{ rotate: `${tilt}deg` }, { scale: s }] }}>
      <View style={{ flex: 1, borderRadius: size / 2, borderWidth: 4, borderColor: ring, alignItems: 'center', justifyContent: 'center', opacity: half ? 0.5 : 0.95 }}>
        {compact ? null : (
          <View style={{ position: 'absolute', top: 3, left: 0, right: 0, alignItems: 'center' }}>
            <T v="label" color={ring} style={{ fontSize: 14, letterSpacing: 1.5, lineHeight: 16 }}>{label}</T>
          </View>
        )}
        <Icon name={icon} size={size * (compact ? 0.62 : 0.5)} style={{ marginTop: compact ? 0 : 10 }} />
        <View style={{ position: 'absolute', inset: 8, borderRadius: size, borderWidth: 1.5, borderColor: ring }} pointerEvents="none" />
      </View>
    </Animated.View>
  );
}
