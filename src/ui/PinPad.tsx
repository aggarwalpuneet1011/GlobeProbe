import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { C } from './theme';
import { T } from './Text';
import { Icon } from './Icon';
import { hapticLight } from './haptics';

/** 4-digit PIN entry: big keys (64 dp), dots above. Calls onComplete with the 4 digits, then clears itself. */
export function PinPad({ onComplete, disabled, resetKey }: { onComplete: (pin: string) => void; disabled?: boolean; resetKey?: number }) {
  const [digits, setDigits] = useState('');
  React.useEffect(() => { setDigits(''); }, [resetKey]);
  const press = (d: string) => {
    if (disabled) return;
    hapticLight();
    const next = (digits + d).slice(0, 4);
    setDigits(next);
    if (next.length === 4) setTimeout(() => { onComplete(next); setDigits(''); }, 120);
  };
  const del = () => { if (!disabled) { hapticLight(); setDigits((d) => d.slice(0, -1)); } };
  const key = (label: string, onPress: () => void, a11y: string, content?: React.ReactNode) => (
    <Pressable key={a11y} accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} disabled={disabled}
      style={({ pressed }) => ({ width: 76, height: 64, borderRadius: 20, borderWidth: 2, borderColor: C.ink, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : 1, transform: [{ translateY: pressed ? 2 : 0 }] })}>
      {content ?? <T v="h1">{label}</T>}
    </Pressable>
  );
  return (
    <View style={{ alignItems: 'center', gap: 20 }}>
      <View accessible accessibilityLabel={`${digits.length} of 4 digits entered`} style={{ flexDirection: 'row', gap: 16 }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.ink, backgroundColor: i < digits.length ? C.ink : C.paper }} />
        ))}
      </View>
      <View style={{ width: 76 * 3 + 24, flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => key(d, () => press(d), d))}
        <View style={{ width: 76, height: 64 }} />
        {key('0', () => press('0'), '0')}
        {key('', del, 'Delete', <Icon name="back" size={28} />)}
      </View>
    </View>
  );
}
