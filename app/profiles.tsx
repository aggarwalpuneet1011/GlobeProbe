import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../src/ui/Screen';
import { T } from '../src/ui/Text';
import { C } from '../src/ui/theme';
import { Card, Enter } from '../src/ui/Card';
import { Avatar } from '../src/ui/Avatar';
import { Bindu } from '../src/ui/Bindu';
import { ParentGate } from '../src/ui/ParentGate';
import { useApp } from '../src/state/app';
import { MAX_PROFILES } from '../src/db/queries';
import { Icon } from '../src/ui/Icon';
import { TextLink } from '../src/ui/ChunkyButton';
import { DeleteProfileSheet } from '../src/ui/DeleteProfileSheet';
import type { Profile } from '../src/db/queries';

/** S1. Who's exploring? Up to 4 local profiles; lock icon opens the Parent Zone (3 s hold, then PIN). */
export default function Profiles() {
  const router = useRouter();
  const app = useApp();
  const [toDelete, setToDelete] = useState<Profile | null>(null);
  useEffect(() => { void app.leaveProfile(); void app.reloadProfiles(); app.lockParent(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (id: string) => { await app.selectProfile(id); router.replace('/(tabs)/home'); };
  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Bindu size={96} expression="curious" />
        <T v="h1" center>Who's exploring?</T>
      </View>
      <View style={{ gap: 16 }}>
        {app.profiles.map((p, i) => (
          <Enter key={p.id} index={i}>
            <Card onPress={() => pick(p.id)} accessibilityLabel={`${p.name}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 56 }}>
                <Avatar name={p.name} colour={p.colour} size={56} />
                <View style={{ flex: 1 }}>
                  <T v="h2">{p.name}</T>
                  <T v="label" color={C.ink2}>{p.rank}</T>
                </View>
              </View>
            </Card>
            <View style={{ alignItems: 'flex-end' }}>
              <TextLink label="Delete" onPress={() => setToDelete(p)} color={C.ink2} />
            </View>
          </Enter>
        ))}
        {app.profiles.length < MAX_PROFILES ? (
          <Card onPress={() => router.push('/setup')} accessibilityLabel="Add a profile">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 56 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderStyle: 'dashed', borderColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="star" size={28} />
              </View>
              <T v="h2">Add a profile</T>
            </View>
          </Card>
        ) : null}
      </View>
      <View style={{ alignItems: 'center', marginTop: 12 }}>
        <ParentGate onUnlocked={() => { app.unlockParent(); router.push('/parent'); }} />
      </View>
      <DeleteProfileSheet profile={toDelete} onClose={() => setToDelete(null)} />
    </Screen>
  );
}
