import { useEffect } from 'react';
import { AppState } from 'react-native';
import { usePrefs } from './prefs';
import { holdAwake } from '../state/keepAwake';

/** Screen stays on while the app is open and in front, unless the parent turned "Keep screen on" off. */
export function KeepAwakeHost() {
  const { keepAwake } = usePrefs();
  useEffect(() => {
    if (!keepAwake) return;
    let release: (() => void) | null = null;
    let alive = true;
    const on = () => { if (!release) void holdAwake('app').then((r) => { if (alive && !release) release = r; else r(); }); };
    const off = () => { release?.(); release = null; };
    if (AppState.currentState === 'active') on();
    const sub = AppState.addEventListener('change', (s) => (s === 'active' ? on() : off()));
    return () => { alive = false; sub.remove(); off(); };
  }, [keepAwake]);
  return null;
}
