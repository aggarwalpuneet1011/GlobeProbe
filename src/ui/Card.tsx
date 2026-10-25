import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { C, R } from './theme';
import { usePrefs } from './prefs';
import { playSfx } from './sfx';
import { hapticLight } from './haptics';

/** Paper, radius 24, 2 dp ink border, 4 dp offset shadow at 18% ink, padding 16. */
export function Card({ children, style, onPress, accessibilityLabel, fill = C.paper, pad = 16 }: {
  children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string; fill?: string; pad?: number;
}) {
  const body = (
    <View style={{ borderRadius: R.card, borderWidth: 2, borderColor: C.ink, backgroundColor: fill, padding: pad }}>{children}</View>
  );
  const wrap = (
    <View style={[{ marginBottom: 4 }, style]}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 4, bottom: -4, borderRadius: R.card, backgroundColor: C.shadowSoft }} />
      {body}
    </View>
  );
  if (!onPress) return wrap;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      onPress={() => { playSfx('tap'); hapticLight(); onPress(); }}
      style={({ pressed }) => ({ transform: [{ translateY: pressed ? 2 : 0 }] })}>
      {wrap}
    </Pressable>
  );
}

/** Fade and rise 12 dp over 220 ms, staggered 60 ms per index. Instant under Reduce motion. */
export function Enter({ index = 0, children, style }: { index?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { reduceMotion } = usePrefs();
  const v = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) { v.setValue(1); return; }
    Animated.timing(v, { toValue: 1, duration: 220, delay: index * 60, useNativeDriver: true }).start();
  }, [index, reduceMotion, v]);
  return (
    <Animated.View style={[{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }, style]}>{children}</Animated.View>
  );
}
