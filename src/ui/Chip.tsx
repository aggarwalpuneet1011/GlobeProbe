import React from 'react';
import { Pressable } from 'react-native';
import { C } from './theme';
import { T } from './Text';
import { Icon } from './Icon';
import { playSfx } from './sfx';
import { hapticLight } from './haptics';

/** Pill, 36 dp tall (56 dp tap area), 2 dp border; selected = coral fill, white text. */
export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!selected }} disabled={!onPress}
      onPress={() => { playSfx('tap'); hapticLight(); onPress?.(); }} hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
      style={{ height: 36, borderRadius: 18, borderWidth: 2, borderColor: C.ink, backgroundColor: selected ? C.coral : C.paper, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {icon ? <Icon name={icon} size={20} /> : null}
      <T v="label" color={selected ? '#FFFFFF' : C.ink}>{label}</T>
    </Pressable>
  );
}
