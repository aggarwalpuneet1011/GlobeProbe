import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Baloo2_700Bold, Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2';
import { Nunito_600SemiBold, Nunito_700Bold } from '@expo-google-fonts/nunito';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../src/state/app';
import { RankUpHost } from '../src/ui/RankUpHost';
import { KeepAwakeHost } from '../src/ui/KeepAwakeHost';
import { ToastProvider } from '../src/ui/Toast';
import { LiveProvider } from '../src/state/live';
import { SplashView } from '../src/ui/SplashView';
import { ErrorScreen } from '../src/ui/ErrorScreen';
import { C } from '../src/ui/theme';

void SplashScreen.preventAutoHideAsync().catch(() => {});

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  const router = useRouter();
  return <ErrorScreen error={error} retry={retry} onBack={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }} />;
}

export default function RootLayout() {
  const [loaded, fontError] = useFonts({ Baloo2_700Bold, Baloo2_800ExtraBold, Nunito_600SemiBold, Nunito_700Bold });
  const ready = loaded || !!fontError;
  useEffect(() => { if (ready) void SplashScreen.hideAsync().catch(() => {}); }, [ready]);
  if (!ready) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.cream }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <AppProvider fallback={(s) => <SplashView message={s.status === 'error' ? 'Something went wrong while opening the app. Please close it and open it again.' : undefined} />}>
          <ToastProvider>
            <LiveProvider>
            <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', animationDuration: 250, contentStyle: { backgroundColor: C.cream } }} />
              <RankUpHost />
              <KeepAwakeHost />
            </LiveProvider>
          </ToastProvider>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
