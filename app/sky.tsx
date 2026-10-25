import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import { Screen } from '../src/ui/Screen';
import { T } from '../src/ui/Text';
import { Card } from '../src/ui/Card';
import { Icon } from '../src/ui/Icon';
import { Chip } from '../src/ui/Chip';
import { IconButton, ChunkyButton } from '../src/ui/ChunkyButton';
import { MiniCoast } from '../src/ui/MiniCoast';
import { SpeechBubble } from '../src/ui/SpeechBubble';
import { useToast } from '../src/ui/Toast';
import { takePhoto } from '../src/ui/camera';
import { playSfx } from '../src/ui/sfx';
import { C } from '../src/ui/theme';
import { useApp } from '../src/state/app';
import { useLive } from '../src/state/live';
import * as Q from '../src/db/queries';
import { logError } from '../src/state/errorlog';
import { DIARY, SKY, SYSTEM } from '../src/content/copy';
import { cacheState, lastCheckedLabel } from '../src/live/openmeteo';
import { mumbaiNow, rainRace, tideEvents } from '../src/live/sky';
import { ATTRIBUTION, LIVE_PLACES } from '../src/live/places';
import { weatherWord } from '../src/live/translate';
import { fmtHours, nowIso } from '../src/util/time';

const OBSERVED = SKY.observe;
const LOW_TIDE_RE = /low/i;

function TideCurve({ curve, nowHour, width }: { curve: number[]; nowHour: number; width: number }) {
  const h = 70;
  const lo = Math.min(...curve), hi = Math.max(...curve);
  const x = (i: number) => 8 + (i / 23) * (width - 16);
  const y = (v: number) => h - 8 - ((v - lo) / Math.max(0.01, hi - lo)) * (h - 16);
  const path = useMemo(() => { const p = Skia.Path.Make(); curve.forEach((v, i) => (i ? p.lineTo(x(i), y(v)) : p.moveTo(x(i), y(v)))); return p; }, [curve, width]); // eslint-disable-line react-hooks/exhaustive-deps
  const cx = x(Math.min(23, Math.max(0, nowHour)));
  const cy = y(curve[Math.min(23, Math.max(0, Math.round(nowHour)))]);
  return (
    <Canvas style={{ width, height: h }} accessible accessibilityLabel="Today's tide curve">
      <Path path={path} color={C.sea} style="stroke" strokeWidth={4} strokeJoin="round" strokeCap="round" />
      <Circle cx={cx} cy={cy} r={7} color={C.coral} />
      <Circle cx={cx} cy={cy} r={7} color={C.ink} style="stroke" strokeWidth={2} />
    </Canvas>
  );
}

/** S10. Sky Today: Mumbai now, breeze line, tide card, rain race, "Your check", attribution. */
export default function SkyToday() {
  const router = useRouter();
  const app = useApp();
  const live = useLive();
  const toast = useToast();
  const { width: winW } = useWindowDimensions();
  const [observed, setObserved] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const profile = app.active;
  const w = winW - 40;

  useFocusEffect(useCallback(() => { void live.refreshIfNeeded(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps

  const now = nowIso();
  const state = cacheState(live.fetchedAt, now);
  const mum = live.weather['mum'];
  const ok = state !== 'hidden' && !!mum;
  const sky = ok ? mumbaiNow(mum, now) : null;
  const tides = state !== 'hidden' ? tideEvents(live.tide, now) : null;
  const race = ok ? rainRace(live.weather) : [];
  const maxMm = Math.max(1, ...race.map((r) => r.mm));
  if (!profile) return null;

  const log = async (what: string, withPhoto: boolean) => {
    let photo: string | null = null;
    if (withPhoto) {
      const r = await takePhoto(profile.id);
      if (r.ok) photo = r.path; else if (r.reason === 'denied') toast(SYSTEM.cameraDenied); else if (r.reason === 'failed') toast(SYSTEM.photoSaveFailed);
    }
    const word = sky?.weather?.word ?? null;
    try {
      await Q.addSky(app.db, profile.id, what, photo, ok ? { word, mm: sky?.rainTodayMm ?? 0, windLine: sky?.windLine ?? null } : null);
      playSfx('pop'); setSaved(true);
    } catch (e) { void logError('sky-log', e); }
    // Reality can disagree with the model. Never tell her she is wrong about what she sees.
    const sawWet = /drizzle|rain|downpour/i.test(what);
    if (ok && sawWet && (sky?.rainTodayMm ?? 0) === 0) setNote(SYSTEM.skyDisagree);
    else setNote('');
  };

  const next = tides?.next ?? null;
  const low = tides?.events.find((e) => LOW_TIDE_RE.test(e.label) && e.clock > (tides?.nowHour ?? 0)) ?? tides?.events.find((e) => LOW_TIDE_RE.test(e.label));
  const labConcept = (id: string) => router.push(`/lab/${id}`);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton icon="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'))} />
        <T v="h1" style={{ flex: 1 }}>{SKY.title}</T>
      </View>

      {!ok ? <SpeechBubble text="I can't see the weather service right now. You can still look out of the window!" expression="curious" binduSize={56} /> : null}

      {sky ? (
        <Card>
          <T v="label" color="#4A5565">{SKY.mumbaiNow}</T>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: C.ink }}><MiniCoast width={120} height={140} fromDeg={sky.fromDeg} windKmh={sky.windKmh} /></View>
            <View style={{ flex: 1, gap: 4 }}>
              <T v="h2">{sky.windLine}</T>
              <T color="#4A5565">{sky.strength}</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {sky.weather ? <Icon name={sky.weather.icon} size={40} /> : null}
                <T v="choice">{sky.tempC}°C · {sky.humidity}%{sky.weather ? ` · ${sky.weather.word}` : ''}</T>
              </View>
            </View>
          </View>
          {state === 'stale' && live.fetchedAt ? <T v="label" color="#4A5565">{lastCheckedLabel(live.fetchedAt, now)}</T> : null}
          {sky.breeze ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
              <T v="choice" style={{ flex: 1 }}>{sky.breeze}</T>
              <Chip label={SKY.seeWhy} icon="lab" onPress={() => labConcept('SIM_BREEZE')} />
            </View>
          ) : null}
        </Card>
      ) : null}

      {tides ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name="tide" size={40} />
            <T v="h2" style={{ flex: 1 }}>{next ? next.label : tides.events[tides.events.length - 1]?.label}</T>
            <Chip label={SKY.seeWhy} icon="lab" onPress={() => labConcept('SIM_TIDE')} />
          </View>
          <View style={{ gap: 2, marginVertical: 6 }}>{tides.events.map((e) => <T key={e.kind + e.clock} color="#4A5565">{e.label}</T>)}</View>
          <TideCurve curve={tides.curve} nowHour={tides.nowHour} width={w - 32} />
          {low ? <T v="label" color="#4A5565">{SKY.walk.replace('{time}', fmtHours(Math.round(low.clock * 6) / 6))}</T> : null}
        </Card>
      ) : null}

      {race.length ? (
        <Card>
          <T v="h2">{SKY.rainRace}</T>
          {race.map((r) => {
            const p = LIVE_PLACES.find((x) => x.id === r.id)!;
            return (
              <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={`${r.name}: ${r.mm} millimetres. Show on the globe.`} style={{ minHeight: 56, justifyContent: 'center', gap: 4 }}
                onPress={() => router.push(`/(tabs)/globe?lat=${p.lat}&lon=${p.lon}`)}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T v="choice">{r.name}</T><T v="label">{r.mm} mm</T></View>
                <View style={{ height: 16, borderRadius: 8, backgroundColor: C.todo, overflow: 'hidden', borderWidth: 1.5, borderColor: C.ink }}>
                  <View style={{ width: `${Math.max(2, (r.mm / maxMm) * 100)}%`, height: '100%', backgroundColor: C.sea }} />
                </View>
              </Pressable>
            );
          })}
        </Card>
      ) : null}

      <Card>
        <T v="h2">{SKY.yourCheck}</T>
        <T color="#4A5565">{DIARY.skyPrompt}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {OBSERVED.map((o) => <Chip key={o} label={o} selected={observed === o} onPress={() => { setObserved(o); setSaved(false); setNote(''); }} icon={weatherWord(({ Sunny: 0, Cloudy: 3, Drizzle: 53, Rain: 63, Downpour: 82 } as Record<string, number>)[o])?.icon} />)}
        </View>
        {observed ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><ChunkyButton small label={saved ? 'Saved' : 'Save'} disabled={saved} onPress={() => log(observed, false)} /></View>
            <View style={{ flex: 1.2 }}><ChunkyButton small kind="secondary" icon="camera" label="With a photo" disabled={saved} onPress={() => log(observed, true)} /></View>
          </View>
        ) : null}
        {note ? <SpeechBubble text={note} expression="happy" binduSize={48} /> : null}
      </Card>

      <T v="label" color="#4A5565" center>{ATTRIBUTION}</T>
    </Screen>
  );
}
