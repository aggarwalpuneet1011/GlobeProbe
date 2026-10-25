import React, { useEffect, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/ui/Screen';
import { T } from '../../src/ui/Text';
import { StepDots } from '../../src/ui/StepDots';
import { IconButton, ChunkyButton } from '../../src/ui/ChunkyButton';
import { BottomSheet } from '../../src/ui/BottomSheet';
import { WhySheet } from '../../src/ui/WhySheet';
import { useToast } from '../../src/ui/Toast';
import { useHardwareBack } from '../../src/ui/hooks';
import { SP } from '../../src/ui/theme';
import { useApp } from '../../src/state/app';
import * as P from '../../src/state/progress';
import * as Q from '../../src/db/queries';
import { logError } from '../../src/state/errorlog';
import { maybeConcept } from '../../src/content';
import { STOP } from '../../src/content/copy';
import { startStepFor, stampKind } from '../../src/stop/flow';
import { useSimSession } from '../../src/stop/useSimSession';
import { useSay } from '../../src/stop/useSay';
import { ExplainBlock } from '../../src/stop/ExplainBlock';
import { TwistBlock } from '../../src/stop/TwistBlock';
import { KnowIt } from '../../src/stop/KnowIt';
import { HookStep, PredictStep, WatchStep, NameItStep, StampStep } from '../../src/stop/steps';
import type { Concept } from '../../src/types';
import { nowIso } from '../../src/util/time';

export default function StopRoute() {
  const { conceptId, mode } = useLocalSearchParams<{ conceptId: string; mode?: string }>();
  const router = useRouter();
  const app = useApp();
  const concept = maybeConcept(String(conceptId));
  useEffect(() => { if (!concept || !app.active) router.replace('/(tabs)/home'); }, [concept, app.active]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!concept || !app.active) return null;
  return mode === 'knowit' ? <KnowIt concept={concept} /> : <StopFlow concept={concept} mode={mode} />;
}

type Phase = 1 | 2 | 3 | 4 | 5 | 6;

/** S4. The six-step lesson. Progress is saved after every step; a failure to save never blocks the child. */
function StopFlow({ concept, mode }: { concept: Concept; mode?: string }) {
  const router = useRouter();
  const app = useApp();
  const toast = useToast();
  const { say, stop } = useSay();
  const { width: winW } = useWindowDimensions();
  const width = winW - SP.side * 2;
  const { session, sink } = useSimSession(concept);
  const profile = app.active!;

  const [step, setStep] = useState<Phase | null>(null);
  const [twist, setTwist] = useState(false);
  const [leave, setLeave] = useState(false);
  const [why, setWhy] = useState(false);
  const [helpUsed, setHelpUsed] = useState(false);
  const [predicted, setPredicted] = useState<string | null>(null);
  const explainAnswered = useRef(false);
  const half = useRef(false);
  const level = useRef<number>(app.levelOf(concept.id));

  // Open or resume the Stop.
  useEffect(() => {
    const p = app.progressOf(concept.id);
    const start = startStepFor(p.stopStep, mode) as Phase;
    void (async () => {
      try { await (mode === 'replay' || p.stopStep >= 6 ? P.restartStop : P.startStop)(app.db, profile.id, concept.id); } catch (e) { void logError('startStop', e); }
      setStep(start);
    })();
    return () => stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Runs a save, refreshes app state, shows a rank-up if one happened, and remembers the new level. Errors are logged and swallowed. */
  const save = async (fn: () => Promise<P.Outcome>): Promise<P.Outcome | null> => {
    try {
      const out = await fn();
      level.current = out.progress.level;
      await app.refresh();
      if (out.rankUp) app.showRankUp(out.rankUp);
      return out;
    } catch (e) { void logError('stop-save', e); return null; }
  };
  const finished = (n: Phase) => save(() => P.finishStep(app.db, profile.id, concept.id, n));
  const go = (n: Phase) => { stop(); setStep(n); };

  useHardwareBack(() => {
    if (step === 6) { exit(); return true; }
    setLeave(true);
    return true;
  });
  const exit = () => { stop(); if (router.canGoBack()) router.back(); else router.replace('/(tabs)/home'); };

  // The Stamp step saves the finished Stop (and opens the mission) the moment it appears.
  useEffect(() => { if (step === 6) void finished(6); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  if (step === null) return null;
  const base = { concept, session, width, say };

  return (
    <Screen scrollKey={`${step}${twist ? 't' : ''}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <StepDots done={step - 1} current={step} />
          {step > 1 ? <T v="label" color="#4A5565" numberOfLines={1}>{concept.title}</T> : null}
        </View>
        <IconButton icon="why" label="Why?" onPress={() => {
          if (step === 4 && !explainAnswered.current && !helpUsed) { setHelpUsed(true); toast(STOP.helpNote); }
          setWhy(true);
        }} />
      </View>

      {step === 1 ? <HookStep {...base} onNext={async () => { await finished(1); go(2); }} /> : null}

      {step === 2 ? (
        <PredictStep {...base}
          onLock={(id) => { setPredicted(id); return Q.addAttempt(app.db, profile.id, { conceptId: concept.id, kind: 'predict', itemId: `${concept.id}:predict`, choiceId: id, correct: id === concept.predict.answer, firstTry: true, at: nowIso() }); }}
          onNext={async () => { await finished(2); go(3); }} />
      ) : null}

      {step === 3 ? (
        <WatchStep {...base} sink={sink} predicted={predicted} onWatched={() => { void finished(3); }} onNext={() => go(4)} />
      ) : null}

      {step === 4 ? (
        <ExplainBlock concept={concept} session={session} width={width} say={say} helpUsed={helpUsed}
          example="home"
          onAnswer={async (a) => {
            explainAnswered.current = true;
            const out = await save(() => P.answerExplain(app.db, profile.id, concept.id, { ...a, example: 'home', itemId: `${concept.id}:explain` }));
            if (out?.halfStamp) half.current = true;
          }}
          onFinished={async () => { await finished(4); go(5); }} />
      ) : null}

      {step === 5 && !twist ? (
        <NameItStep {...base}
          onAnswer={(a) => save(() => P.answerNaming(app.db, profile.id, concept.id, 'name', a.itemId, a.choice, a.correct, a.firstTry))}
          onNext={async () => {
            // The Twist rides along on a replay once the concept is Explained and not yet Mastered.
            if (level.current === 3) { setTwist(true); return; }
            await finished(5); go(6);
          }} />
      ) : null}

      {step === 5 && twist ? (
        <TwistBlock concept={concept} say={say}
          onAnswer={(id, ok) => save(() => P.answerTwist(app.db, profile.id, concept.id, id, ok, true))}
          onFinished={async () => { await finished(5); setTwist(false); go(6); }} />
      ) : null}

      {step === 6 ? (
        <StampStep concept={concept} kind={stampKind(level.current, half.current)}
          onLab={() => router.replace(`/lab/${concept.sim}`)}
          onMission={() => router.replace(`/(tabs)/diary?mission=${concept.id}`)}
          onDone={() => router.replace('/(tabs)/home')} />
      ) : null}

      <WhySheet visible={why} onClose={() => setWhy(false)} concept={concept} />
      <BottomSheet visible={leave} onClose={() => setLeave(false)} scroll={false}>
        <View style={{ padding: 20, gap: 14 }}>
          <T v="h2">{STOP.leaveTitle}</T>
          <T>{STOP.leaveBody}</T>
          <ChunkyButton label={STOP.keepGoing} onPress={() => setLeave(false)} />
          <ChunkyButton kind="ghost" label={STOP.leave} onPress={() => { setLeave(false); exit(); }} />
        </View>
      </BottomSheet>
    </Screen>
  );
}
