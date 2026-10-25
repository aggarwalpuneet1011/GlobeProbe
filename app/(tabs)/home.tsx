import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '../../src/ui/Screen';
import { T } from '../../src/ui/Text';
import { C } from '../../src/ui/theme';
import { Card, Enter } from '../../src/ui/Card';
import { Avatar } from '../../src/ui/Avatar';
import { Bindu } from '../../src/ui/Bindu';
import { SpeechBubble } from '../../src/ui/SpeechBubble';
import { ChunkyButton, IconButton, TextLink } from '../../src/ui/ChunkyButton';
import { StepDots } from '../../src/ui/StepDots';
import { Icon } from '../../src/ui/Icon';
import { MiniCoast } from '../../src/ui/MiniCoast';
import { ProfileMenu } from '../../src/ui/ProfileMenu';
import { useToast } from '../../src/ui/Toast';
import { usePrefs } from '../../src/ui/prefs';
import { speak } from '../../src/ui/voice';
import { useApp } from '../../src/state/app';
import { useLive } from '../../src/state/live';
import * as Q from '../../src/db/queries';
import { CASES, CONCEPTS, getConcept } from '../../src/content';
import { HOME, STOP } from '../../src/content/copy';
import { nextStop } from '../../src/learning/nextStop';
import { dueReviews } from '../../src/learning/scheduler';
import { pickGreeting } from '../../src/learning/greeting';
import { knowItAllowed } from '../../src/learning/mastery';
import { caseUnlocked } from '../../src/state/progress';
import { mumbaiNow, tideEvents } from '../../src/live/sky';
import { rainNowFromCode } from '../../src/live/translate';
import { cacheState } from '../../src/live/openmeteo';
import { nowIso } from '../../src/util/time';
import type { ConceptId } from '../../src/types';

const NEEDS = Object.fromEntries(CONCEPTS.map((c) => [c.id, c.needs])) as Record<ConceptId, ConceptId[]>;

/** S2. Header, Bindu greeting, Warm-up, Continue, Sky Today, Case alert, Mission. */
export default function Home() {
  const router = useRouter();
  const app = useApp();
  const live = useLive();
  const toast = useToast();
  const { ttsRate } = usePrefs();
  const { width } = useWindowDimensions();
  const [menu, setMenu] = useState(false);
  const [mission, setMission] = useState<Q.MissionRow | null>(null);
  const [attempted, setAttempted] = useState<string[]>([]);
  const profile = app.active;

  useFocusEffect(useCallback(() => {
    if (!profile) return;
    void app.refresh();
    void live.refreshIfNeeded();
    void Q.homeMission(app.db, profile.id).then(setMission);
    void Q.listCaseAttempts(app.db, profile.id).then((rows) => setAttempted(rows.map((r) => r.caseId)));
  }, [profile?.id])); // eslint-disable-line react-hooks/exhaustive-deps

  const now = nowIso();
  const mum = live.weather['mum'];
  const liveOk = cacheState(live.fetchedAt, now) !== 'hidden' && !!mum;
  const sky = liveOk ? mumbaiNow(mum, now) : null;
  const tides = liveOk ? tideEvents(live.tide, now) : null;

  const nextId = useMemo(() => (profile ? nextStop(app.progress, NEEDS, profile.schoolSyncConcept) : null), [app.progress, profile]);
  const due = useMemo(() => dueReviews(app.reviews, app.progress, now), [app.reviews, app.progress]); // eslint-disable-line react-hooks/exhaustive-deps
  const openCase = useMemo(() => CASES.find((c) => caseUnlocked(c, app.progress) && !app.solvedCases.includes(c.id)) ?? null, [app.progress, app.solvedCases]);
  const caseJustUnlocked = !!openCase && !attempted.includes(openCase.id);

  const greeting = useMemo(() => pickGreeting({
    now, name: profile?.name, rainNow: sky ? rainNowFromCode(mum?.now.code) : null, windFromDeg: sky ? mum?.now.windDeg : null, caseJustUnlocked,
  }), [profile?.name, sky?.fromDeg, mum?.now.code, caseJustUnlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  const binduFace = greeting.kind === 'rain' || greeting.kind === 'seaBreeze' ? 'curious' : greeting.kind === 'caseUnlocked' ? 'happy' : 'neutral';
  useEffect(() => { if (profile?.readAloud) void speak(greeting.text, ttsRate); }, [greeting.text, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile) return null;
  const nextConcept = nextId ? getConcept(nextId) : null;
  const nextProg = nextId ? app.progressOf(nextId) : null;
  const started = !!nextProg && (!!nextProg.startedAt && nextProg.stopStep < 6);
  const showKnowIt = !!nextProg && !nextProg.startedAt && nextProg.stopStep === 0;
  const bubbleW = width - 40;

  return (
    <Screen tabs>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Profile menu" onPress={() => setMenu(true)} hitSlop={8} style={{ width: 56, height: 56, justifyContent: 'center' }}>
          <Avatar name={profile.name} colour={profile.colour} size={40} />
        </Pressable>
        <View style={{ backgroundColor: C.sun, borderWidth: 2, borderColor: C.ink, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 }}>
          <T v="label">{profile.rank}</T>
        </View>
        <View style={{ width: 56 }} />
      </View>

      <Enter index={0}>
        <View style={{ maxWidth: bubbleW }}>
          <SpeechBubble text={greeting.text} expression={binduFace} binduSize={72} />
        </View>
      </Enter>

      {due.length > 0 ? (
        <Enter index={1}>
          <Card fill="#FFF3D6" onPress={() => router.push('/review')} accessibilityLabel={`${HOME.warmUp}. ${HOME.warmUpBody}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }}>
              <Icon name="replay" size={40} />
              <View style={{ flex: 1 }}>
                <T v="h2">{HOME.warmUp}</T>
                <T v="body" color={C.ink2}>{HOME.warmUpBody}</T>
              </View>
            </View>
          </Card>
        </Enter>
      ) : null}

      <Enter index={2}>
        <Card>
          {nextConcept && nextProg ? (
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Icon name={nextConcept.icon} size={64} />
                <T v="h2" style={{ flex: 1 }}>{nextConcept.title}</T>
              </View>
              <StepDots done={nextProg.stopStep >= 6 ? 0 : nextProg.stopStep} />
              <ChunkyButton label={started ? HOME.continue : HOME.start} onPress={() => router.push(`/stop/${nextConcept.id}`)} />
              {showKnowIt ? (
                <View style={{ alignItems: 'center' }}>
                  <TextLink label={HOME.iKnowThis} icon="know_it" onPress={() => {
                    if (!knowItAllowed(nextProg, nowIso())) { toast(STOP.knowItBlocked); return; }
                    router.push(`/stop/${nextConcept.id}?mode=knowit`);
                  }} />
                </View>
              ) : null}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <Bindu size={56} expression="happy" />
              <T v="h2" style={{ flex: 1 }}>{HOME.allDone}</T>
            </View>
          )}
        </Card>
      </Enter>

      {sky ? (
        <Enter index={3}>
          <Card onPress={() => router.push('/sky')} accessibilityLabel="Sky Today">
            <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
              <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: C.ink }}>
                <MiniCoast width={96} height={96} fromDeg={sky.fromDeg} windKmh={sky.windKmh} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <T v="h2">Sky Today</T>
                <T v="body">{sky.windShort}{sky.breeze ? ` · ${sky.breeze}` : ''}</T>
                <T v="label" color={C.ink2}>{HOME.rainToday.replace('{amount}', sky.rainWord)}</T>
                {tides?.next ? <T v="label" color={C.ink2}>{tides.next.label}</T> : null}
              </View>
            </View>
          </Card>
        </Enter>
      ) : null}

      {openCase ? (
        <Enter index={4}>
          <Card fill="#EEF0FF" onPress={() => router.push(`/case/${openCase.id}`)} accessibilityLabel={HOME.newCase.replace('{title}', openCase.title)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }}>
              <Icon name="case" size={48} />
              <T v="h2" style={{ flex: 1 }}>{HOME.newCase.replace('{title}', openCase.title)}</T>
            </View>
          </Card>
        </Enter>
      ) : null}

      {mission ? (
        <Enter index={5}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <T v="label" color={C.ink2}>Mission</T>
                <T v="body">{getConcept(mission.conceptId).mission.text}</T>
              </View>
              <IconButton icon="camera" label="Open mission" onPress={() => router.push(`/(tabs)/diary?mission=${mission.conceptId}`)} />
            </View>
          </Card>
        </Enter>
      ) : null}

      <ProfileMenu visible={menu} onClose={() => setMenu(false)} />
    </Screen>
  );
}

