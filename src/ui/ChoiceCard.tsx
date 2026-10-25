import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { C, R } from './theme';
import { T } from './Text';
import { Icon } from './Icon';
import { usePrefs } from './prefs';
import { playSfx } from './sfx';
import { hapticLight } from './haptics';

export type ChoiceState = 'idle' | 'selected' | 'correct' | 'notquite' | 'dim';

/** Answer card. Correct = green 15% + check; not-quite = nudge 20% + try-again icon. Never red, never an X. */
export function ChoiceCard({ text, icon, state = 'idle', onPress, onSpeak, disabled, iconSize = 48 }: {
  text: string; icon?: string; state?: ChoiceState; onPress?: () => void; onSpeak?: () => void; disabled?: boolean; iconSize?: number;
}) {
  const { reduceMotion } = usePrefs();
  const pop = useRef(new Animated.Value(state === 'correct' ? 1 : 0)).current;
  useEffect(() => {
    if (state === 'correct') {
      if (reduceMotion) { pop.setValue(1); return; }
      pop.setValue(0);
      Animated.sequence([
        Animated.timing(pop, { toValue: 1.15, duration: 130, useNativeDriver: true }),
        Animated.timing(pop, { toValue: 1, duration: 130, useNativeDriver: true }),
      ]).start();
    } else pop.setValue(0);
  }, [state, reduceMotion, pop]);

  const border = state === 'selected' ? C.sea : C.ink;
  const bg = state === 'selected' ? C.selectedFill : state === 'correct' ? 'rgba(63,174,90,0.15)' : state === 'notquite' ? 'rgba(242,177,52,0.2)' : C.paper;
  return (
    <View style={{ opacity: state === 'dim' ? 0.55 : 1, marginBottom: 4 }}>
      <Pressable
        accessibilityRole="button" accessibilityLabel={text} accessibilityState={{ selected: state === 'selected', disabled: !!disabled }}
        disabled={disabled || !onPress}
        onPress={() => { playSfx('pop'); hapticLight(); onPress?.(); }}
        style={({ pressed }) => ({
          minHeight: 64, borderRadius: R.choice, borderWidth: state === 'selected' ? 3 : 2, borderColor: border, backgroundColor: bg,
          flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingLeft: icon ? 8 : 16, paddingRight: 8, gap: 12,
          transform: [{ translateY: pressed ? 2 : 0 }],
        })}>
        {icon ? <Icon name={icon} size={iconSize} /> : null}
        <T v="choice" style={{ flex: 1 }}>{text}</T>
        {state === 'correct' && (
          <Animated.View style={{ transform: [{ scale: pop }] }}><Icon name="check" size={32} /></Animated.View>
        )}
        {state === 'notquite' && <Icon name="try_again" size={32} />}
        {onSpeak && state !== 'correct' && state !== 'notquite' ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Read aloud: ${text}`} onPress={onSpeak} hitSlop={6}
            style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="speaker" size={24} />
          </Pressable>
        ) : null}
      </Pressable>
    </View>
  );
}
