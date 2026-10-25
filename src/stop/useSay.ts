import { useCallback } from 'react';
import { usePrefs } from '../ui/prefs';
import { speak, stopSpeaking } from '../ui/voice';
import { useApp } from '../state/app';

/** Reads a Bindu line aloud when "Read aloud" is on for the active profile. Never blocks anything. */
export function useSay() {
  const { active } = useApp();
  const { ttsRate } = usePrefs();
  const on = !!active?.readAloud;
  const say = useCallback((text: string) => { if (on && text) void speak(text, ttsRate); }, [on, ttsRate]);
  const sayAnyway = useCallback((text: string) => { void speak(text, ttsRate); }, [ttsRate]);
  return { say, sayAnyway, stop: stopSpeaking, on };
}
