import React, { useEffect, useRef } from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, SP } from './theme';

/** Cream background, 20 dp side padding, safe-area aware. `tabs` adds room for the 64 dp tab bar. */
export function Screen({ children, scroll = true, tabs, style, bg = C.cream, pad = true, scrollKey }: {
  children: React.ReactNode; scroll?: boolean; tabs?: boolean; style?: StyleProp<ViewStyle>; bg?: string; pad?: boolean; scrollKey?: unknown;
}) {
  const ref = useRef<ScrollView>(null);
  useEffect(() => { ref.current?.scrollTo({ y: 0, animated: false }); }, [scrollKey]);
  const insets = useSafeAreaInsets();
  const inner: ViewStyle = { paddingTop: insets.top + 12, paddingBottom: (tabs ? 64 + 16 : insets.bottom + 16), paddingHorizontal: pad ? SP.side : 0, gap: SP.gap };
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: bg }, inner, style]}>{children}</View>;
  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <ScrollView ref={ref} contentContainerStyle={[inner, style as ViewStyle]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    </View>
  );
}
