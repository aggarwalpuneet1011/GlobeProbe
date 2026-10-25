import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { C } from './theme';
import { T } from './Text';
import { Bindu } from './Bindu';
import { usePrefs } from './prefs';
import { playSfx } from './sfx';
import { hapticSuccess } from './haptics';
import { mulberry32 } from '../util/rng';

/** Full-screen rank celebration: rank_up sound, raindrops and leaves falling for 2.5 s, tap to dismiss. */
export function RankUp({ rank, onClose }: { rank: string | null; onClose: () => void }) {
  const { reduceMotion } = usePrefs();
  const { width, height } = useWindowDimensions();
  const pieces = useMemo(() => {
    const r = mulberry32(7);
    return Array.from({ length: 26 }, (_, i) => ({ x: r() * width, delay: r() * 700, size: 12 + r() * 12, leaf: i % 3 === 0, drift: (r() - 0.5) * 80 }));
  }, [width]);
  const fall = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!rank) return;
    playSfx('rank_up'); hapticSuccess();
    fall.setValue(0);
    if (!reduceMotion) Animated.timing(fall, { toValue: 1, duration: 2500, easing: Easing.in(Easing.quad), useNativeDriver: true }).start();
    const t = setTimeout(onClose, 2500);
    return () => clearTimeout(t);
  }, [rank]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rank) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityRole="button" accessibilityLabel={`New rank: ${rank}. Tap to continue.`} onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(255,248,236,0.97)', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        {!reduceMotion && pieces.map((p, i) => (
          <Animated.View key={i} pointerEvents="none" style={{
            position: 'absolute', top: -40, left: p.x, width: p.size, height: p.size * (p.leaf ? 0.6 : 1.3),
            backgroundColor: p.leaf ? C.green : C.sea, borderWidth: 2, borderColor: C.ink,
            borderRadius: p.leaf ? p.size / 2 : p.size / 2, borderTopLeftRadius: p.leaf ? 2 : p.size / 2,
            transform: [{ translateY: fall.interpolate({ inputRange: [0, 1], outputRange: [-p.delay * 0.2, height + 60] }) }, { translateX: fall.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) }, { rotate: p.leaf ? '35deg' : '0deg' }],
          }} />
        ))}
        <Bindu size={160} expression="happy" />
        <T v="label" color={C.ink2}>New rank</T>
        <View style={{ backgroundColor: C.sun, borderWidth: 2, borderColor: C.ink, borderRadius: 24, paddingHorizontal: 24, paddingVertical: 8 }}>
          <T v="display" center>{rank}</T>
        </View>
      </Pressable>
    </Modal>
  );
}
