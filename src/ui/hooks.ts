import { useCallback, useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect } from 'expo-router';

/** Android hardware/gesture back: run `handler`; return true from it to consume the press. Only active while the screen is focused. */
export function useHardwareBack(handler: () => boolean) {
  const ref = useRef(handler);
  ref.current = handler;
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => ref.current());
    return () => sub.remove();
  }, []));
}

/** setTimeout that cleans up on unmount. */
export function useTimeouts() {
  const ids = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { ids.current.forEach(clearTimeout); }, []);
  return useCallback((fn: () => void, ms: number) => { ids.current.push(setTimeout(fn, ms)); }, []);
}
