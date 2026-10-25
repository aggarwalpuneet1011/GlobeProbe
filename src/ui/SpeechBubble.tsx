import React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { C, R } from './theme';
import { T } from './Text';
import { Bindu } from './Bindu';
import { Icon } from './Icon';
import type { BinduExpression } from './assets';
import { stopSpeaking } from './voice';

/** Bindu plus one speech bubble. Tap the bubble to stop reading aloud. Max width 85% of the screen. */
export function SpeechBubble({ text, expression = 'neutral', binduSize = 48, onSpeak, showSpeaker }: {
  text: string; expression?: BinduExpression; binduSize?: number; onSpeak?: () => void; showSpeaker?: boolean;
}) {
  const { width } = useWindowDimensions();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
      {binduSize > 0 ? <Bindu size={binduSize} expression={expression} /> : null}
      <Pressable accessibilityRole="text" accessibilityLabel={`Bindu says: ${text}`} onPress={stopSpeaking}
        style={{ maxWidth: width * 0.85 - binduSize, flexShrink: 1, marginBottom: 6 }}>
        <View style={{ backgroundColor: C.paper, borderRadius: R.bubble, borderWidth: 2, borderColor: C.ink, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T style={{ flexShrink: 1 }}>{text}</T>
          {showSpeaker && onSpeak ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Read aloud" onPress={onSpeak} hitSlop={8} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="speaker" size={24} />
            </Pressable>
          ) : null}
        </View>
        {/* tail pointing at Bindu on the left */}
        {binduSize > 0 ? <View pointerEvents="none" style={{ position: 'absolute', left: -8, bottom: 14, width: 14, height: 14, backgroundColor: C.paper, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: C.ink, transform: [{ rotate: '45deg' }] }} /> : null}
      </Pressable>
    </View>
  );
}
