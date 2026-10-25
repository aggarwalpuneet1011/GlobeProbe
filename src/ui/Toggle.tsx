import React from 'react';
import { Pressable, View } from 'react-native';
import { C } from './theme';
import { T } from './Text';
import { hapticLight } from './haptics';
import { playSfx } from './sfx';

export function ToggleRow({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }}
      onPress={() => { playSfx('tap'); hapticLight(); onChange(!value); }}
      style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <T v="choice">{label}</T>
        {hint ? <T v="label" color={C.ink2}>{hint}</T> : null}
      </View>
      <View style={{ width: 60, height: 34, borderRadius: 17, borderWidth: 2, borderColor: C.ink, backgroundColor: value ? C.green : C.todo, justifyContent: 'center', paddingHorizontal: 3, alignItems: value ? 'flex-end' : 'flex-start' }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: C.paper, borderWidth: 2, borderColor: C.ink }} />
      </View>
    </Pressable>
  );
}
