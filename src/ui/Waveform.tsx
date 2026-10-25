import React, { useRef } from 'react';
import { View } from 'react-native';
import { C } from './theme';

/** Simple level bars for the mic: remembers the last 28 levels. */
export function Waveform({ level }: { level: number }) {
  const hist = useRef<number[]>(Array(28).fill(0));
  hist.current = [...hist.current.slice(1), level];
  return (
    <View accessible accessibilityLabel="Recording" style={{ height: 56, flexDirection: 'row', alignItems: 'center', gap: 3, justifyContent: 'center', borderRadius: 16, borderWidth: 2, borderColor: C.ink, backgroundColor: C.paper, paddingHorizontal: 8 }}>
      {hist.current.map((v, i) => <View key={i} style={{ width: 6, height: 6 + v * 40, borderRadius: 3, backgroundColor: C.coral }} />)}
    </View>
  );
}
