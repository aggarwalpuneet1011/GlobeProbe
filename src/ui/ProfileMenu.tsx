import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { BottomSheet } from './BottomSheet';
import { T } from './Text';
import { C } from './theme';
import { Avatar } from './Avatar';
import { ToggleRow } from './Toggle';
import { ChunkyButton } from './ChunkyButton';
import { usePrefs } from './prefs';
import { useApp } from '../state/app';
import { stopSpeaking } from './voice';
import { DeleteProfileSheet } from './DeleteProfileSheet';

/** Profile menu: Read aloud and Sound toggles, switch profile. Settings are not on Home itself. */
export function ProfileMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const { active, patchActive } = useApp();
  const prefs = usePrefs();
  const [del, setDel] = useState(false);
  if (!active) return null;
  return (
    <>
    <BottomSheet visible={visible && !del} onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={active.name} colour={active.colour} size={56} />
        <View>
          <T v="h2">{active.name}</T>
          <T v="label" color={C.ink2}>{active.rank}</T>
        </View>
      </View>
      <ToggleRow label="Read aloud" value={active.readAloud} onChange={(v) => { if (!v) stopSpeaking(); void patchActive({ readAloud: v }); }} />
      <ToggleRow label="Sound" value={prefs.sound} onChange={(v) => prefs.set({ sound: v })} />
      <ChunkyButton kind="secondary" label="Switch profile" onPress={() => { onClose(); router.replace('/profiles'); }} />
      <ChunkyButton kind="ghost" label="Delete this profile" onPress={() => setDel(true)} />
    </BottomSheet>
    <DeleteProfileSheet profile={del ? active : null} onClose={() => setDel(false)} onDeleted={() => { setDel(false); onClose(); router.replace('/profiles'); }} />
    </>
  );
}
