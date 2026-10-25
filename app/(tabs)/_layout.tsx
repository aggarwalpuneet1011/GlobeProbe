import React, { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { TabBar } from '../../src/ui/TabBar';
import { BreakNudge } from '../../src/ui/BreakNudge';
import { useApp } from '../../src/state/app';
import { C } from '../../src/ui/theme';

const TAB_PATHS = ['/home', '/journey', '/globe', '/diary'];

export default function TabsLayout() {
  const router = useRouter();
  const path = usePathname();
  const { active } = useApp();

  // Back on another tab goes to Home; back on Home is the default Android exit (no dialog).
  useEffect(() => {
    if (!TAB_PATHS.includes(path) || path === '/home') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { router.navigate('/(tabs)/home'); return true; });
    return () => sub.remove();
  }, [path, router]);

  // No active profile (e.g. cold deep link): send to Profiles.
  useEffect(() => { if (!active) router.replace('/profiles'); }, [active, router]);

  return (
    <>
      <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.cream } }}>
        <Tabs.Screen name="home" />
        <Tabs.Screen name="journey" />
        <Tabs.Screen name="globe" />
        <Tabs.Screen name="diary" />
      </Tabs>
      <BreakNudge />
    </>
  );
}
