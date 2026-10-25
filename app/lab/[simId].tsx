import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/ui/Screen';
import { T } from '../../src/ui/Text';
import { Card } from '../../src/ui/Card';
import { ChunkyButton, IconButton } from '../../src/ui/ChunkyButton';
import { ChoiceCard } from '../../src/ui/ChoiceCard';
import { BottomSheet } from '../../src/ui/BottomSheet';
import { SpeechBubble } from '../../src/ui/SpeechBubble';
import { Stamp } from '../../src/ui/Stamp';
import { useToast } from '../../src/ui/Toast';
import { playSfx } from '../../src/ui/sfx';
import { SP } from '../../src/ui/theme';
import { useApp } from '../../src/state/app';
import * as Q from '../../src/db/queries';
import { logError } from '../../src/state/errorlog';
import { CONCEPTS } from '../../src/content';
import { LAB } from '../../src/content/copy';
import { evalCheck } from '../../src/learning/labChecks';
import { SimSession, createSimFor } from '../../src/sims';
import { SimPanel } from '../../src/stop/SimPanel';
import type { LabChallenge } from '../../src/types';

/** S6. Free play with the sim, all controls on, no script, plus Lab Challenges (9.2). */
export default function Lab() {
  const { simId } = useLocalSearchParams<{ simId: string }>();
  const concept = CONCEPTS.find((c) => c.sim === simId);
  const router = useRouter();
  const app = useApp();
  const toast = useToast();
  const { width: winW } = useWindowDimensions();
  const width = winW - SP.side * 2;
  const profile = app.active;
  const session = useMemo(() => (concept ? new SimSession(createSimFor(concept), null, 0) : null), [concept?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [drawer, setDrawer] = useState(false);
  const [solved, setSolved] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, 'yes' | 'no'>>({});
  const solvedRef = useRef<string[]>([]);
  solvedRef.current = solved;

  useEffect(() => { if (!concept || !profile) router.replace('/(tabs)/home'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (profile) void Q.labSolved(app.db, profile.id).then(setSolved).catch(() => {}); }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { session?.play(); return () => session?.pause(); }, [session]);

  const markSolved = async (ch: LabChallenge) => {
    if (!profile || solvedRef.current.includes(ch.id)) return;
    setSolved((s) => (s.includes(ch.id) ? s : [...s, ch.id]));
    playSfx('stamp'); toast(`${LAB.solved}: ${ch.text}`);
    try { await Q.markLabSolved(app.db, profile.id, ch.id); } catch (e) { void logError('lab-solve', e); }
  };

  // reach_state challenges are checked against the live sim metrics a few times a second.
  useEffect(() => {
    if (!concept || !session) return;
    const id = setInterval(() => {
      const m = session.sim.metrics();
      for (const ch of concept.labChallenges) if (ch.type === 'reach_state' && ch.check && !solvedRef.current.includes(ch.id) && evalCheck(ch.check, m)) void markSolved(ch);
    }, 250);
    return () => clearInterval(id);
  }, [concept?.id, session]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!concept || !profile || !session) return null;
  const unsolved = concept.labChallenges.filter((c) => !solved.includes(c.id)).length;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton icon="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'))} />
        <T v="h2" style={{ flex: 1 }} numberOfLines={2}>{concept.title}</T>
      </View>
      <SimPanel concept={concept} session={session} width={width} enabled />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><ChunkyButton small kind="ghost" icon="replay" label={LAB.reset} onPress={() => { session.restore(); session.play(); }} /></View>
        <View style={{ flex: 1.4 }}><ChunkyButton small kind="secondary" icon="lab" label={unsolved ? `${LAB.challenges} (${unsolved})` : LAB.challenges} onPress={() => setDrawer(true)} /></View>
      </View>

      <BottomSheet visible={drawer} onClose={() => setDrawer(false)}>
        <View style={{ padding: 20, gap: 14 }}>
          <T v="h2">{LAB.challenges}</T>
          {concept.labChallenges.map((ch) => {
            const done = solved.includes(ch.id);
            const picked = answers[ch.id];
            return (
              <Card key={ch.id} fill={done ? 'rgba(63,174,90,0.12)' : undefined}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <T v="choice" style={{ flex: 1 }}>{ch.text}</T>
                  {done ? <Stamp icon={concept.icon} size={48} compact label={LAB.solved} /> : null}
                </View>
                {ch.type === 'is_it_possible' ? (
                  <View style={{ marginTop: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {(['yes', 'no'] as const).map((a) => (
                        <View key={a} style={{ flex: 1 }}>
                          <ChoiceCard text={a === 'yes' ? LAB.yes : LAB.no} disabled={done}
                            state={picked === a ? (a === ch.answer ? 'correct' : 'notquite') : done && a === ch.answer ? 'correct' : 'idle'}
                            onPress={() => {
                              setAnswers((m) => ({ ...m, [ch.id]: a }));
                              if (a === ch.answer) void markSolved(ch); else playSfx('notquite');
                            }} />
                        </View>
                      ))}
                    </View>
                    {picked || done ? <SpeechBubble text={ch.reason ?? ''} expression={picked === ch.answer || done ? 'happy' : 'encouraging'} binduSize={40} /> : null}
                  </View>
                ) : null}
              </Card>
            );
          })}
          <ChunkyButton kind="ghost" label="Close" onPress={() => setDrawer(false)} />
        </View>
      </BottomSheet>
    </Screen>
  );
}
