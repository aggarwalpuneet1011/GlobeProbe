import React, { useEffect } from 'react';
import { View } from 'react-native';
import { C } from './theme';
import { T } from './Text';
import { Bindu } from './Bindu';
import { ChunkyButton } from './ChunkyButton';
import { SYSTEM } from '../content/copy';
import { logError } from '../state/errorlog';

/** "Oops, this page got a bit cloudy." plus a Back button. The error goes to the local error_log file. */
export function ErrorScreen({ error, retry, onBack }: { error: Error; retry?: () => void; onBack?: () => void }) {
  useEffect(() => { void logError('screen', error); }, [error]);
  return (
    <View style={{ flex: 1, backgroundColor: C.cream, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }}>
      <Bindu size={120} expression="encouraging" />
      <T v="h1" center>{SYSTEM.oops}</T>
      <View style={{ alignSelf: 'stretch', gap: 12 }}>
        <ChunkyButton label="Back" onPress={() => { onBack?.(); retry?.(); }} />
      </View>
    </View>
  );
}
