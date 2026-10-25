import React from 'react';
import { View } from 'react-native';
import { C, bubbleColour } from './theme';
import { T } from './Text';

export function Avatar({ name, colour, size = 40 }: { name: string; colour: string; size?: number }) {
  return (
    <View accessible accessibilityLabel={`${name}'s profile`} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bubbleColour(colour), borderWidth: 2, borderColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
      <T v={size >= 56 ? 'h1' : 'label'} color="#FFFFFF" style={{ lineHeight: size >= 56 ? 30 : 18, includeFontPadding: false }}>{(name.trim()[0] ?? '?').toUpperCase()}</T>
    </View>
  );
}
