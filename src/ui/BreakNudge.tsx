import React, { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { SpeechBubble } from './SpeechBubble';
import { ChunkyButton } from './ChunkyButton';
import { HOME } from '../content/copy';
import { speak } from './voice';
import { useApp } from '../state/app';
import { usePrefs } from './prefs';

const AFTER_MS = 25 * 60 * 1000;

/** After 25 minutes of continuous use Bindu offers a stretch, once per sitting. No lockout. */
export function BreakNudge() {
  const { active } = useApp();
  const { ttsRate } = usePrefs();
  const [open, setOpen] = useState(false);
  const shown = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileId = active?.id ?? null;

  useEffect(() => {
    shown.current = false;
    const arm = () => {
      if (timer.current) clearTimeout(timer.current);
      if (!profileId || shown.current) return;
      timer.current = setTimeout(() => { shown.current = true; setOpen(true); if (active?.readAloud) void speak(HOME.breakNudge, ttsRate); }, AFTER_MS);
    };
    arm();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') arm(); else if (timer.current) clearTimeout(timer.current); });
    return () => { sub.remove(); if (timer.current) clearTimeout(timer.current); };
  }, [profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <BottomSheet visible={open} onClose={() => setOpen(false)} scroll={false}>
      <SpeechBubble text={HOME.breakNudge} expression="happy" binduSize={64} />
      <View style={{ gap: 12, paddingBottom: 8 }}>
        <ChunkyButton label={HOME.breakOk} onPress={() => setOpen(false)} />
        <ChunkyButton kind="ghost" label={HOME.breakMore} onPress={() => setOpen(false)} />
      </View>
    </BottomSheet>
  );
}
