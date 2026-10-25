import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { C } from './theme';
import { T } from './Text';

const Ctx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

/** Ink fill, white text, radius 20, bottom 96 dp, 2.5 s. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const op = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(op, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    timer.current = setTimeout(() => {
      Animated.timing(op, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMsg(null));
    }, 2500);
  }, [op]);
  return (
    <Ctx.Provider value={show}>
      {children}
      {msg ? (
        <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" style={{ position: 'absolute', left: 20, right: 20, bottom: 96, alignItems: 'center', opacity: op }}>
          <View style={{ backgroundColor: C.ink, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 12 }}>
            <T v="body" color="#FFFFFF" center>{msg}</T>
          </View>
        </Animated.View>
      ) : null}
    </Ctx.Provider>
  );
}
