import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/ui/Screen';
import { T } from '../../src/ui/Text';
import { Card } from '../../src/ui/Card';
import { Icon } from '../../src/ui/Icon';
import { Chip } from '../../src/ui/Chip';
import { Segmented } from '../../src/ui/Segmented';
import { ChunkyButton } from '../../src/ui/ChunkyButton';
import { ChoiceCard } from '../../src/ui/ChoiceCard';
import { BottomSheet } from '../../src/ui/BottomSheet';
import { SpeechBubble } from '../../src/ui/SpeechBubble';
import { Stamp } from '../../src/ui/Stamp';
import { StopCardSheet } from '../../src/ui/StopCard';
import { useToast } from '../../src/ui/Toast';
import { takePhoto } from '../../src/ui/camera';
import { playSfx } from '../../src/ui/sfx';
import { C } from '../../src/ui/theme';
import { useApp } from '../../src/state/app';
import * as Q from '../../src/db/queries';
import { caseUnlocked } from '../../src/state/progress';
import { logError } from '../../src/state/errorlog';
import { CASES, CONCEPTS, PLACES, getConcept } from '../../src/content';
import { CASE, DIARY, STOP, SYSTEM } from '../../src/content/copy';
import { fmtDateShort, istParts } from '../../src/util/time';
import type { ConceptId } from '../../src/types';

type Seg = 'missions' | 'sky' | 'passport' | 'cases';
const SEGS: { id: Seg; label: string }[] = [
  { id: 'missions', label: DIARY.tabs[0] }, { id: 'sky', label: DIARY.tabs[1] }, { id: 'passport', label: DIARY.tabs[2] }, { id: 'cases', label: DIARY.tabs[3] },
];

/** S9. Diary: Missions, Sky log, Passport, Cases. The count only goes up; there is no streak. */
export default function Diary() {
  const { mission: missionParam } = useLocalSearchParams<{ mission?: string }>();
  const router = useRouter();
  const app = useApp();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const profile = app.active;
  const [seg, setSeg] = useState<Seg>(missionParam ? 'missions' : 'missions');
  const [days, setDays] = useState(0);
  const [missions, setMissions] = useState<Q.MissionRow[]>([]);
  const [sky, setSky] = useState<Q.SkyRow[]>([]);
  const [found, setFound] = useState<string[]>([]);
  const [labs, setLabs] = useState<string[]>([]);
  const [sheet, setSheet] = useState<ConceptId | null>(null);
  const [card, setCard] = useState<ConceptId | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const [d, m, s, f, l] = await Promise.all([
        Q.diaryDays(app.db, profile.id), Q.listMissions(app.db, profile.id), Q.listSky(app.db, profile.id), Q.placesFound(app.db, profile.id), Q.labSolved(app.db, profile.id),
      ]);
      setDays(d); setMissions(m); setSky(s); setFound(f); setLabs(l);
    } catch (e) { void logError('diary-load', e); }
  }, [app.db, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { if (missionParam) { setSeg('missions'); setSheet(missionParam as ConceptId); } }, [missionParam]);
  if (!profile) return null;

  return (
    <Screen tabs>
      <T v="h1">Diary</T>
      <T color="#4A5565">{DIARY.days.replace('{n}', String(days))}</T>
      <Segmented options={SEGS} value={seg} onChange={setSeg} label="Diary sections" />

      {seg === 'missions' ? <Missions missions={missions} onOpen={setSheet} /> : null}
      {seg === 'sky' ? <SkyLog rows={sky} /> : null}

      {seg === 'passport' ? (
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {CONCEPTS.map((c) => {
              const lvl = app.levelOf(c.id);
              const size = (width - 40 - 36) / 4;
              return (
                <View key={c.id} style={{ width: size, alignItems: 'center', gap: 4 }}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`${c.title}. ${lvl >= 3 ? 'Stamped' : 'Not stamped yet'}`} onPress={() => setCard(c.id)}
                    style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', borderRadius: size / 2, borderWidth: 2, borderStyle: lvl >= 3 ? 'solid' : 'dashed', borderColor: lvl >= 3 ? 'transparent' : C.ink2 }}>
                    {lvl >= 3 ? <Stamp icon={c.icon} size={size} compact tilt={-10} label="" /> : <Icon name={c.icon} size={size * 0.6} style={{ opacity: 0.3 }} />}
                  </Pressable>
                  <T v="label" center numberOfLines={2}>{c.short}</T>
                </View>
              );
            })}
          </View>
          <Card>
            <T v="h2">{DIARY.places.replace('{n}', String(found.length))}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {PLACES.places.filter((p) => found.includes(p.id)).map((p) => <Chip key={p.id} label={p.name} icon={p.icon} />)}
            </View>
          </Card>
          <Card><T v="h2">Lab challenges solved: {labs.length}</T></Card>
        </View>
      ) : null}

      {seg === 'cases' ? (
        <View style={{ gap: 12 }}>
          {CASES.map((c) => {
            const open = caseUnlocked(c, app.progress);
            const solved = app.solvedCases.includes(c.id);
            const missing = c.needs.filter((n) => app.levelOf(n) < 3);
            return (
              <Card key={c.id} fill={solved ? 'rgba(63,174,90,0.12)' : C.paper} onPress={() => (open ? router.push(`/case/${c.id}`) : toast(SYSTEM.lockedStop.replace('{prereq}', missing.map((n) => getConcept(n).short).join(' and '))))}
                accessibilityLabel={`${CASE.folder.replace('{n}', String(c.number))}. ${c.title}. ${solved ? 'Solved' : open ? 'Open' : 'Locked'}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: open ? 1 : 0.55 }}>
                  <Icon name={open ? 'case' : 'lock'} size={48} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <T v="label" color="#4A5565">{CASE.folder.replace('{n}', String(c.number))}</T>
                    <T v="h2">{c.title}</T>
                    {!open ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {missing.map((n) => <Chip key={n} label={DIARY.needs.replace('{x}', getConcept(n).short)} />)}
                      </View>
                    ) : null}
                  </View>
                  {solved ? <Stamp icon="case" size={56} compact label={DIARY.solved} tilt={-14} /> : null}
                </View>
              </Card>
            );
          })}
        </View>
      ) : null}

      <MissionSheet conceptId={sheet} onClose={() => setSheet(null)} onDone={() => { void load(); void app.refresh(); }} />
      <StopCardSheet conceptId={card} onClose={() => setCard(null)} />
    </Screen>
  );
}

function Missions({ missions, onOpen }: { missions: Q.MissionRow[]; onOpen: (id: ConceptId) => void }) {
  if (!missions.length) return <SpeechBubble text={DIARY.noMissions} expression="curious" binduSize={56} />;
  return (
    <View style={{ gap: 12 }}>
      {missions.map((m) => {
        const c = getConcept(m.conceptId);
        const done = m.status === 'done';
        const answer = c.mission.answers.find((a) => a.id === m.answerId);
        return (
          <Card key={m.conceptId} onPress={() => !done && onOpen(m.conceptId)} accessibilityLabel={`${c.title} mission. ${done ? 'Done' : 'Open'}`}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <Icon name={c.icon} size={48} />
              <View style={{ flex: 1, gap: 4 }}>
                <T v="label" color="#4A5565">{c.short}</T>
                <T>{c.mission.text}</T>
                {done ? <T v="label" color="#4A5565">{answer ? `${answer.text} · ` : ''}{m.doneAt ? fmtDateShort(m.doneAt) : ''}</T> : null}
              </View>
              {done && m.photoPath ? <Image source={{ uri: m.photoPath }} accessibilityLabel="Your mission photo" style={{ width: 64, height: 64, borderRadius: 12, borderWidth: 2, borderColor: C.ink }} /> : null}
              {done ? <Icon name="check" size={32} /> : null}
            </View>
            {!done ? <ChunkyButton small label={DIARY.iDidIt} onPress={() => onOpen(m.conceptId)} /> : null}
          </Card>
        );
      })}
    </View>
  );
}

function MissionSheet({ conceptId, onClose, onDone }: { conceptId: ConceptId | null; onClose: () => void; onDone: () => void }) {
  const app = useApp();
  const toast = useToast();
  const [answer, setAnswer] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [debrief, setDebrief] = useState<string | null>(null);
  useEffect(() => { setAnswer(null); setPhoto(null); setDebrief(null); }, [conceptId]);
  const c = conceptId ? getConcept(conceptId) : null;
  const profile = app.active;
  const snap = async () => {
    if (!profile) return;
    const r = await takePhoto(profile.id);
    if (r.ok) setPhoto(r.path);
    else if (r.reason === 'denied') toast(SYSTEM.cameraDenied);
    else if (r.reason === 'failed') toast(SYSTEM.photoSaveFailed);
  };
  const finish = async () => {
    if (!c || !profile) return;
    try { await Q.completeMission(app.db, profile.id, c.id, answer, photo); playSfx('correct'); setDebrief(c.mission.debrief); onDone(); } catch (e) { void logError('mission', e); }
  };
  return (
    <BottomSheet visible={!!c} onClose={onClose}>
      {c ? (
        <View style={{ gap: 12 }}>
          <T v="h2">{c.mission.text}</T>
          {debrief ? (
            <>
              <SpeechBubble text={debrief} expression="happy" binduSize={56} />
              <ChunkyButton label={STOP.done} onPress={onClose} />
            </>
          ) : (
            <>
              <View>{c.mission.answers.map((a) => <ChoiceCard key={a.id} text={a.text} state={answer === a.id ? 'selected' : 'idle'} onPress={() => setAnswer(a.id)} />)}</View>
              {photo ? <Image source={{ uri: photo }} accessibilityLabel="Your photo" style={{ width: '100%', height: 160, borderRadius: 16, borderWidth: 2, borderColor: C.ink }} /> : null}
              <ChunkyButton kind="secondary" icon="camera" label={DIARY.addPhoto} onPress={snap} />
              <ChunkyButton label={DIARY.iDidIt} onPress={finish} />
            </>
          )}
        </View>
      ) : null}
    </BottomSheet>
  );
}

function SkyLog({ rows }: { rows: Q.SkyRow[] }) {
  if (!rows.length) return <SpeechBubble text="Your sky log is empty. Open Sky Today and tell me what you see." expression="curious" binduSize={56} />;
  const rainy = rows.filter((r) => /drizzle|rain|downpour/i.test(r.observed));
  // After 14 entries: rainy days per week of this month.
  const showChart = rows.length >= 14;
  const month = istParts(new Date()).month;
  const weeks = [0, 0, 0, 0, 0];
  const seen = new Set<string>();
  for (const r of rainy) {
    const p = istParts(r.createdAt);
    if (p.month !== month) continue;
    const key = `${p.month}-${p.day}`;
    if (seen.has(key)) continue;
    seen.add(key); weeks[Math.min(4, Math.floor((p.day - 1) / 7))]++;
  }
  const max = Math.max(1, ...weeks);
  return (
    <View style={{ gap: 12 }}>
      {showChart ? (
        <Card>
          <T v="h2">Your rainy days this month</T>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 90 }}>
            {weeks.map((n, i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                <T v="label">{n}</T>
                <View style={{ width: '100%', height: 8 + (n / max) * 52, backgroundColor: C.sea, borderRadius: 8, borderWidth: 2, borderColor: C.ink }} />
                <T v="label" color="#4A5565">W{i + 1}</T>
              </View>
            ))}
          </View>
        </Card>
      ) : null}
      {rows.map((r) => {
        const snap = r.dataSnapshot as { word?: string | null; mm?: number } | null;
        return (
          <Card key={r.id}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <T v="label" color="#4A5565">{fmtDateShort(r.createdAt)}</T>
                <T v="choice">You saw: {r.observed}</T>
                {snap?.word ? <T color="#4A5565">Data said: {snap.word}, {snap.mm ?? 0} mm</T> : null}
              </View>
              {r.photoPath ? <Image source={{ uri: r.photoPath }} accessibilityLabel="Your sky photo" style={{ width: 64, height: 64, borderRadius: 12, borderWidth: 2, borderColor: C.ink }} /> : null}
            </View>
          </Card>
        );
      })}
    </View>
  );
}
