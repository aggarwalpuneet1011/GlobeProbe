import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { SplashView } from '../src/ui/SplashView';
import { useApp } from '../src/state/app';
import { hasPin } from '../src/state/pin';
import { logError } from '../src/state/errorlog';

/** S0. Shows Bindu and the wordmark for about a second, then routes: first launch -> setup; one profile -> Home; else Profiles. */
export default function Splash() {
  const router = useRouter();
  const app = useApp();
  useEffect(() => {
    let alive = true;
    const t0 = Date.now();
    (async () => {
      try {
        const [pin, list] = await Promise.all([hasPin(), app.reloadProfiles()]);
        const wait = Math.max(0, 1000 - (Date.now() - t0));
        await new Promise((r) => setTimeout(r, wait));
        if (!alive) return;
        if (!pin || list.length === 0) { router.replace('/setup'); return; }
        if (list.length === 1) { await app.selectProfile(list[0].id); if (alive) router.replace('/(tabs)/home'); return; }
        router.replace('/profiles');
      } catch (e) {
        void logError('splash', e);
        if (alive) router.replace('/profiles');
      }
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <SplashView />;
}
