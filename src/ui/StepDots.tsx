import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { C } from './theme';
import { usePrefs } from './prefs';

/** 6 rounded bars, 8 dp tall. done = coral, current = coral pulsing, todo = #E4DCCB. `done` is how many steps are finished. */
export function StepDots({ total = 6, done, current }: { total?: number; done: number; current?: number }) {
  const { reduceMotion } = usePrefs();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotion) { pulse.setValue(1); return; }
    const l = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]));
    l.start();
    return () => l.stop();
  }, [reduceMotion, pulse]);
  const cur = current ?? done + 1;
  return (
    <View accessible accessibilityLabel={`Step ${Math.min(cur, total)} of ${total}`} style={{ flexDirection: 'row', gap: 6 }}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const isDone = n <= done;
        const isCur = !isDone && n === cur;
        const bar = { flex: 1, height: 8, borderRadius: 4, backgroundColor: isDone || isCur ? C.coral : C.todo } as const;
        return isCur ? <Animated.View key={n} style={[bar, { opacity: pulse }]} /> : <View key={n} style={bar} />;
      })}
    </View>
  );
}
