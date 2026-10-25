import React, { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { T } from './Text';
import { C } from './theme';
import { ChunkyButton } from './ChunkyButton';
import { useToast } from './Toast';
import { deleteFiles, useApp } from '../state/app';
import * as Q from '../db/queries';
import { logError } from '../state/errorlog';

/**
 * Delete a profile from where the child picks it (FEEDBACK #5). The same wipe the Parent Zone uses: progress, photos, recordings, then the row.
 * Typing the name stops a stray tap from wiping a child's progress.
 */
export function DeleteProfileSheet({ profile, onClose, onDeleted }: { profile: Q.Profile | null; onClose: () => void; onDeleted?: () => void }) {
  const { db, reloadProfiles, active, leaveProfile } = useApp();
  const toast = useToast();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTyped(''); }, [profile?.id]);

  const go = async () => {
    if (!profile || busy) return;
    setBusy(true);
    try {
      if (active?.id === profile.id) await leaveProfile();
      const files = await Q.deleteProfile(db, profile.id);
      await deleteFiles(files);
      await reloadProfiles();
      toast('Profile deleted');
      onClose();
      onDeleted?.();
    } catch (e) { void logError('delete-profile', e); toast('That did not work. Try again.'); }
    setBusy(false);
  };

  const match = !!profile && typed.trim().toLowerCase() === profile.name.toLowerCase();
  return (
    <BottomSheet visible={!!profile} onClose={onClose}>
      <View style={{ gap: 12, paddingVertical: 8 }}>
        <T v="h1">Delete {profile?.name}?</T>
        <T v="body">This removes the profile, its progress, photos and recordings from this phone. It cannot be undone.</T>
        <T v="label" color={C.ink2}>Type the name "{profile?.name}" to confirm.</T>
        <TextInput value={typed} onChangeText={setTyped} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Type the profile name"
          style={{ minHeight: 56, borderWidth: 2, borderColor: C.ink, borderRadius: 16, paddingHorizontal: 14, fontSize: 18, backgroundColor: C.paper, color: C.ink }} />
        <ChunkyButton label="Delete profile" disabled={busy || !match} onPress={go} />
        <ChunkyButton kind="ghost" label="Cancel" onPress={onClose} />
      </View>
    </BottomSheet>
  );
}
