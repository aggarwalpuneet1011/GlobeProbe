import React from 'react';
import { Pressable, View } from 'react-native';
import { C } from './theme';
import { T } from './Text';
import { playSfx } from './sfx';
import { hapticLight } from './haptics';

/** Segmented pill toggle: 56 dp tall tap targets, selected = coral fill. */
export function Segmented<V extends string>({ options, value, onChange, disabled, label }: {
  options: { id: V; label: string }[]; value: V; onChange: (v: V) => void; disabled?: boolean; label?: string;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', borderRadius: 28, borderWidth: 2, borderColor: C.ink, backgroundColor: C.paper, overflow: 'hidden', opacity: disabled ? 0.5 : 1 }}>
      {options.map((o, i) => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} accessibilityRole="radio" accessibilityLabel={o.label} accessibilityState={{ selected: on, disabled: !!disabled }} disabled={disabled}
            onPress={() => { playSfx('tap'); hapticLight(); onChange(o.id); }}
            style={{ flex: 1, minHeight: 56, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.coral : C.paper, borderLeftWidth: i ? 2 : 0, borderLeftColor: C.ink }}>
            <T v="label" color={on ? '#FFFFFF' : C.ink} center>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}
