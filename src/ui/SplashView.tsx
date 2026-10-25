import React from 'react';
import { View } from 'react-native';
import { C } from './theme';
import { T } from './Text';
import { Bindu } from './Bindu';

export function SplashView({ message }: { message?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.cream, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Bindu size={160} expression="happy" still />
      <T v="display">GlobeProbe</T>
      {message ? <T v="body" color={C.ink2} center style={{ paddingHorizontal: 32 }}>{message}</T> : null}
    </View>
  );
}
