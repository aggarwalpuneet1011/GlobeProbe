import React from 'react';
import { View } from 'react-native';
import { C, R } from './theme';
import { T } from './Text';
import { Icon } from './Icon';
import { ChunkyButton } from './ChunkyButton';
import { BottomSheet } from './BottomSheet';

/** Slides up on the Hook step. Sun-yellow header with the word, 64 dp icon, one-line meaning. Dismiss by swipe down or "Got it". */
export function WordCard({ visible, word, icon, meaning, onClose }: { visible: boolean; word: string; icon?: string; meaning: string; onClose: () => void }) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ borderRadius: R.card, borderWidth: 2, borderColor: C.ink, overflow: 'hidden', backgroundColor: C.paper }}>
        <View style={{ backgroundColor: C.sun, paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 2, borderColor: C.ink }}>
          <T v="h2">{word}</T>
        </View>
        <View style={{ padding: 16, flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          {icon ? <Icon name={icon} size={64} /> : null}
          <T style={{ flex: 1 }}>{meaning}</T>
        </View>
      </View>
      <ChunkyButton label="Got it" onPress={onClose} />
    </BottomSheet>
  );
}
