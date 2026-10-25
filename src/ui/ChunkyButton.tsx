import React, { useRef } from 'react';
import { Animated, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { C, FONT, TOUCH } from './theme';
import { T } from './Text';
import { Icon } from './Icon';
import { playSfx } from './sfx';
import { hapticLight } from './haptics';

export type ButtonKind = 'primary' | 'secondary' | 'ghost';
const FILL: Record<ButtonKind, { bg: string; shadow: string; text: string }> = {
  primary: { bg: C.coral, shadow: C.coralShadow, text: '#FFFFFF' },
  secondary: { bg: C.sea, shadow: C.seaShadow, text: '#FFFFFF' },
  ghost: { bg: C.paper, shadow: C.shadowSoft, text: C.ink },
};

/** 60 dp pill, 2 dp ink border, solid 4 dp shadow; pressed = +3 dp and a 1 dp shadow. */
export function ChunkyButton({ label, onPress, kind = 'primary', icon, disabled, style, small, accessibilityLabel }: {
  label: string; onPress?: () => void; kind?: ButtonKind; icon?: string; disabled?: boolean; style?: StyleProp<ViewStyle>; small?: boolean; accessibilityLabel?: string;
}) {
  const press = useRef(new Animated.Value(0)).current;
  const f = FILL[kind];
  const h = small ? TOUCH : 60;
  const to = (v: number) => Animated.spring(press, { toValue: v, speed: 40, bounciness: 6, useNativeDriver: true }).start();
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPressIn={() => to(1)} onPressOut={() => to(0)}
      onPress={() => { playSfx('tap'); hapticLight(); onPress?.(); }}
      style={[{ minHeight: h + 4, alignSelf: 'stretch' }, style]}>
      <View style={{ height: h + 4 }}>
        {!disabled && (
          <View style={{ position: 'absolute', left: 0, right: 0, top: 4, height: h, borderRadius: h / 2, backgroundColor: f.shadow, borderWidth: 2, borderColor: C.ink }} />
        )}
        <Animated.View style={{
          height: h, borderRadius: h / 2, borderWidth: 2, borderColor: C.ink, backgroundColor: disabled ? C.stone : f.bg, opacity: disabled ? 0.5 : 1,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, gap: 8,
          transform: [{ translateY: press.interpolate({ inputRange: [0, 1], outputRange: [0, 3] }) }],
        }}>
          {icon ? <Icon name={icon} size={24} /> : null}
          <T v="button" color={disabled ? C.ink : f.text} style={{ fontFamily: FONT.baloo800 }} numberOfLines={2}>{label}</T>
        </Animated.View>
      </View>
    </Pressable>
  );
}

/** A small text link (e.g. "I know this!") with a 56 dp tap target. */
export function TextLink({ label, icon, onPress, color = C.sea }: { label: string; icon?: string; onPress: () => void; color?: string }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={() => { playSfx('tap'); hapticLight(); onPress(); }}
      style={{ minHeight: TOUCH, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 12 }}>
      {icon ? <Icon name={icon} size={24} /> : null}
      <T v="label" color={color} style={{ textDecorationLine: 'underline' }}>{label}</T>
    </Pressable>
  );
}

/** Square icon-only button, 56 dp. */
export function IconButton({ icon, onPress, label, size = 56, fill = C.paper, iconSize = 28 }: { icon: string; onPress: () => void; label: string; size?: number; fill?: string; iconSize?: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { playSfx('tap'); hapticLight(); onPress(); }}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: C.ink, backgroundColor: fill, alignItems: 'center', justifyContent: 'center', transform: [{ translateY: pressed ? 2 : 0 }] })}>
      <Icon name={icon} size={iconSize} />
    </Pressable>
  );
}
