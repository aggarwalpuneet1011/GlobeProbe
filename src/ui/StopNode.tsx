import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { C } from './theme';
import { T } from './Text';
import { Icon } from './Icon';
import { Stamp } from './Stamp';
import { usePrefs } from './prefs';

export type NodeState = 'locked' | 'open' | 'progress' | 'stamped' | 'mastered';
export const NODE = 72;

/** One Stop badge on the Journey trail: 72 dp circle with the concept icon. No grades or numbers. */
export function StopNode({ icon, state, stepsDone, label, subLabel, onPress }: {
  icon: string; state: NodeState; stepsDone: number; label: string; subLabel?: string; onPress: () => void;
}) {
  const { reduceMotion } = usePrefs();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (state !== 'open' || reduceMotion) { pulse.setValue(0); return; }
    const l = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 2000, useNativeDriver: true }));
    l.start();
    return () => l.stop();
  }, [state, reduceMotion, pulse]);

  const R = NODE + 12;
  const arc = Skia.Path.Make();
  if (state === 'progress') arc.addArc({ x: 3, y: 3, width: R - 6, height: R - 6 }, -90, Math.max(8, (Math.min(stepsDone, 6) / 6) * 360));

  const locked = state === 'locked';
  const a11y = `${label}. ${locked ? 'Locked.' : state === 'open' ? 'Ready.' : state === 'progress' ? `${stepsDone} of 6 steps done.` : state === 'stamped' ? 'Stamped.' : 'Mastered.'}`;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} style={{ width: 120, alignItems: 'center', minHeight: 56 }}>
      <View style={{ width: R, height: R, alignItems: 'center', justifyContent: 'center' }}>
        {state === 'open' && !reduceMotion ? (
          <Animated.View pointerEvents="none" style={{ position: 'absolute', width: R, height: R, borderRadius: R / 2, borderWidth: 3, borderColor: C.coral, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1.12] }) }] }} />
        ) : null}
        {state === 'open' && reduceMotion ? <View pointerEvents="none" style={{ position: 'absolute', width: R, height: R, borderRadius: R / 2, borderWidth: 3, borderColor: C.coral }} /> : null}
        {state === 'progress' ? (
          <View pointerEvents="none" style={{ position: 'absolute' }}>
            <Canvas style={{ width: R, height: R }}><Path path={arc} color={C.coral} style="stroke" strokeWidth={6} strokeCap="round" /></Canvas>
          </View>
        ) : null}
        <View style={{
          width: NODE, height: NODE, borderRadius: NODE / 2, backgroundColor: locked ? C.todo : C.paper, alignItems: 'center', justifyContent: 'center',
          borderWidth: state === 'mastered' ? 5 : 2, borderColor: state === 'mastered' ? C.sun : C.ink, opacity: locked ? 0.5 : 1,
        }}>
          <View style={{ opacity: locked ? 0.55 : 1 }}><Icon name={icon} size={46} /></View>
        </View>
        {locked ? <View style={{ position: 'absolute', right: 2, bottom: 4 }}><Icon name="lock" size={26} /></View> : null}
        {state === 'stamped' || state === 'mastered' ? (
          <View pointerEvents="none" style={{ position: 'absolute', right: -6, bottom: -4 }}><Stamp icon="stamp" size={40} compact tilt={20} /></View>
        ) : null}
        {state === 'mastered' ? <View pointerEvents="none" style={{ position: 'absolute', left: -4, top: -4 }}><Icon name="star" size={30} /></View> : null}
      </View>
      <T v="label" center style={{ marginTop: 2, opacity: locked ? 0.7 : 1 }} numberOfLines={3}>{label}</T>
      {subLabel ? <T v="label" center color={C.ink2} numberOfLines={2}>{subLabel}</T> : null}
    </Pressable>
  );
}
