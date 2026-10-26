import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/ui/Screen';
import { T } from '../../src/ui/Text';
import { Card } from '../../src/ui/Card';
import { Icon } from '../../src/ui/Icon';
import { Chip } from '../../src/ui/Chip';
import { ChunkyButton, TextLink } from '../../src/ui/ChunkyButton';
import { BottomSheet } from '../../src/ui/BottomSheet';
import { SpeechBubble } from '../../src/ui/SpeechBubble';
import { PHOTOS } from '../../src/ui/photos.generated';
import { playSfx } from '../../src/ui/sfx';
import { C } from '../../src/ui/theme';
import { useApp } from '../../src/state/app';
import * as Q from '../../src/db/queries';
import { logError } from '../../src/state/errorlog';
import { CONCEPTS, PLACES, getConcept } from '../../src/content';
import { DIARY, GLOBE } from '../../src/content/copy';
import { isOpen } from '../../src/learning/nextStop';
import { GlobeView, type GlobeApi, type Pin } from '../../src/three/GlobeView';
import { FlatGlobe } from '../../src/three/FlatGlobe';
import { haversineKm } from '../../src/three/globeMath';
import type { ConceptId, Place } from '../../src/types';

const NEEDS = Object.fromEntries(CONCEPTS.map((c) => [c.id, c.needs])) as Record<ConceptId, ConceptId[]>;

/** S8. Globe tab: round Earth with place pins, Day/Night light, "Find..." prompts and Place cards. Falls back to a flat Equal Earth map. */
export default function Globe() {
  const params = useLocalSearchParams<{ place?: string; lat?: string; lon?: string }>();
  const router = useRouter();
  const app = useApp();
  const [focused, setFocused] = useState(true);
  const { width } = useWindowDimensions();
  const size = width - 40;
  const api = useRef<GlobeApi>(null);
  const profile = app.active;
  const [showPins, setShowPins] = useState(true);
  const [dayNight, setDayNight] = useState(false);
  const [found, setFound] = useState<string[]>([]);
  const [card, setCard] = useState<Place | null>(null);
  const [fails, setFails] = useState(0);
  const [flat, setFlat] = useState(false);
  const [findIdx, setFindIdx] = useState(0);
  const [findMsg, setFindMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(() => { if (profile) void Q.placesFound(app.db, profile.id).then(setFound).catch((e) => logError('globe-found', e)); }, [app.db, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { load(); setFocused(true); return () => setFocused(false); }, [load]));

  const pins: Pin[] = useMemo(() => PLACES.places.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon, found: found.includes(p.id), name: p.name, country: p.country })), [found]);
  const progMap = useMemo(() => new Map(app.progress.map((p) => [p.conceptId, p])), [app.progress]);

  // Deep links: ?place=ID (open its card) or ?lat=&lon= (fly there, e.g. from the Sky rain race).
  useEffect(() => {
    const t = setTimeout(() => {
      if (params.place) { const p = PLACES.places.find((x) => x.id === params.place); if (p) { api.current?.flyTo(p.lat, p.lon); openCard(p); } }
      else if (params.lat && params.lon) api.current?.flyTo(Number(params.lat), Number(params.lon));
    }, 700);
    return () => clearTimeout(t);
  }, [params.place, params.lat, params.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCard = (p: Place) => {
    setCard(p);
    if (profile) void Q.markPlaceFound(app.db, profile.id, p.id).then((isNew) => { if (isNew) { playSfx('pop'); load(); } }).catch((e) => logError('globe-mark', e));
  };
  const onPin = (id: string) => { const p = PLACES.places.find((x) => x.id === id); if (p) openCard(p); };

  const find = PLACES.finds[findIdx % PLACES.finds.length];
  const onTap = (lat: number, lon: number) => {
    const hit = find.targets.map((id) => PLACES.places.find((p) => p.id === id)).filter((p): p is Place => !!p)
      .find((p) => haversineKm(lat, lon, p.lat, p.lon) <= PLACES.findRadiusKm);
    if (hit) {
      playSfx('correct'); setFindMsg({ text: `${GLOBE.found} ${hit.name}.`, ok: true });
      if (profile) void Q.markPlaceFound(app.db, profile.id, hit.id).then((isNew) => { if (isNew) load(); }).catch(() => {});
    } else { playSfx('notquite'); setFindMsg({ text: GLOBE.closeButNo, ok: false }); }
  };

  if (!profile) return null;
  const photo = card ? PHOTOS[card.photo] ?? PHOTOS[card.photo.replace(/\.[a-z]+$/, '')] : undefined;

  return (
    <Screen tabs>
      <T v="h1">Globe</T>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Chip label={GLOBE.places} icon="pin" selected={showPins} onPress={() => setShowPins((v) => !v)} />
        {fails < 3 && !flat ? <Chip label={GLOBE.dayNight} icon="day_night" selected={dayNight} onPress={() => setDayNight((v) => !v)} /> : null}
        {fails < 3 ? <Chip label={GLOBE.flatMap} icon="layers" selected={flat} onPress={() => setFlat((v) => !v)} /> : null}
      </View>
      <T color="#4A5565">{DIARY.places.replace('{n}', String(found.length))}</T>

      <View style={{ alignItems: 'center' }}>
        {fails >= 3 || flat ? (
          <FlatGlobe size={size} pins={pins} showPins={showPins} onPin={onPin} onTapLatLon={onTap} />
        ) : (
          <GlobeView ref={api} key={`gl${fails}`} size={size} pins={pins} showPins={showPins} dayNight={dayNight} active={focused} level={(3 - fails) as 1 | 2 | 3}
            onPin={onPin} onTapLatLon={onTap} onFail={() => setFails((n) => Math.min(3, n + 1))} />
        )}
      </View>

      <Card>
        <T v="h2">{GLOBE.findPrefix} {find.prompt}</T>
        {findMsg ? <SpeechBubble text={findMsg.text} expression={findMsg.ok ? 'happy' : 'curious'} binduSize={48} /> : null}
        {findMsg?.ok ? <ChunkyButton small label="Next" onPress={() => { setFindIdx((i) => i + 1); setFindMsg(null); }} /> : null}
        {!findMsg?.ok ? <TextLink label="Skip" onPress={() => { setFindIdx((i) => i + 1); setFindMsg(null); }} /> : null}
      </Card>

      <BottomSheet visible={!!card} onClose={() => setCard(null)}>
        {card ? (
          <View style={{ gap: 12 }}>
            {photo
              ? <Image source={photo} accessibilityLabel={card.name} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 16, borderWidth: 2, borderColor: C.ink }} />
              : <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 16, borderWidth: 2, borderColor: C.ink, backgroundColor: C.selectedFill, alignItems: 'center', justifyContent: 'center' }}><Icon name={card.icon} size={96} /></View>}
            <View><T v="h2">{card.name}</T><T color="#4A5565">{card.country}</T></View>
            {card.facts.map((f) => {
              const open = isOpen(f.concept, progMap, NEEDS);
              return (
                <View key={f.text} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <Chip label={getConcept(f.concept).short} />
                  </View>
                  <T>{f.text}</T>
                  {open ? <TextLink label={GLOBE.goToStop} onPress={() => { setCard(null); router.push(`/stop/${f.concept}`); }} /> : null}
                </View>
              );
            })}
          </View>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}
