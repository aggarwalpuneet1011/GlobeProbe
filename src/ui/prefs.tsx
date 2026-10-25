// Global UI preferences (sound, reduce motion, read-aloud speed) shared without a state library.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export interface Prefs { sound: boolean; reduceMotionSetting: boolean; ttsRate: number; keepAwake: boolean }
interface PrefsCtx extends Prefs { reduceMotion: boolean; set: (p: Partial<Prefs>) => void }

const Ctx = createContext<PrefsCtx>({ sound: true, reduceMotionSetting: false, ttsRate: 1, keepAwake: true, reduceMotion: false, set: () => {} });

export function PrefsProvider({ initial, onChange, children }: { initial: Prefs; onChange?: (p: Prefs) => void; children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [osReduce, setOsReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setOsReduce(v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOsReduce);
    return () => { alive = false; sub.remove(); };
  }, []);
  const value = useMemo<PrefsCtx>(() => ({
    ...prefs, reduceMotion: prefs.reduceMotionSetting || osReduce,
    set: (p) => setPrefs((cur) => { const next = { ...cur, ...p }; onChange?.(next); return next; }),
  }), [prefs, osReduce, onChange]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const usePrefs = () => useContext(Ctx);
