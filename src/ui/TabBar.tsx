import React from 'react';
import { Pressable, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, TAB_HEIGHT } from './theme';
import { T } from './Text';
import { Icon } from './Icon';
import { playSfx } from './sfx';
import { hapticLight } from './haptics';

const TABS: Record<string, { label: string; icon: string }> = {
  home: { label: 'Home', icon: 'home' },
  journey: { label: 'Journey', icon: 'journey' },
  globe: { label: 'Globe', icon: 'globe' },
  diary: { label: 'Diary', icon: 'diary' },
};
const ORDER = ['home', 'journey', 'globe', 'diary'];

/** 64 dp, white, 2 dp ink top border. Active tab: Coral label and a Coral bar; inactive icons are dimmed. */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  return (
    <View style={{ height: TAB_HEIGHT + insets.bottom, paddingBottom: insets.bottom, backgroundColor: C.paper, borderTopWidth: 2, borderTopColor: C.ink, flexDirection: 'row' }}>
      {ORDER.map((name) => {
        const t = TABS[name];
        const active = current === name;
        return (
          <Pressable key={name} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: active }}
            onPress={() => { if (!active) { playSfx('tap'); hapticLight(); navigation.navigate(name); } }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <View style={{ position: 'absolute', top: 0, width: 36, height: 4, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, backgroundColor: active ? C.coral : 'transparent' }} />
            <View style={{ opacity: active ? 1 : 0.55 }}><Icon name={t.icon} size={30} /></View>
            <T v="label" color={active ? C.coral : C.ink2} style={{ fontSize: 14, lineHeight: 16 }}>{t.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}
