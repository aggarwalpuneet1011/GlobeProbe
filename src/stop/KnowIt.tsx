import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Concept } from '../types';
import { Screen } from '../ui/Screen';
import { T } from '../ui/Text';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { Stamp } from '../ui/Stamp';
import { StepDots } from '../ui/StepDots';
import { ChoiceCard, type ChoiceState } from '../ui/ChoiceCard';
import { ChunkyButton } from '../ui/ChunkyButton';
import { SpeechBubble } from '../ui/SpeechBubble';
import { playSfx } from '../ui/sfx';
import { STOP } from '../content/copy';
import { deckForConcept } from '../content';
import { knowItItems, knowItState } from '../learning/knowIt';
import { knowItAllowed } from '../learning/mastery';
import { knowItResult } from '../state/progress';
import { logError } from '../state/errorlog';
import { useApp } from '../state/app';
import { nowIso } from '../util/time';
import { buildNameQuestions } from './flow';
import { ExplainBlock } from './ExplainBlock';
import { TwistBlock } from './TwistBlock';
import { DuelPick } from './DuelPick';
import { NameQuick } from './NameQuick';
import { useSay } from './useSay';

/** "I know this!": Explain (world example), the Twist, one Duel item. 3 of 3 first try = Mastered. Once per concept per day. */
export function KnowIt({ concept }: { concept: Concept }) {
  const router = useRouter();
  const app = useApp();
  const { say } = useSay();
  const profile = app.active!;
  const progress = app.progressOf(concept.id);
  const [allowed] = useState(() => knowItAllowed(progress, nowIso()));
  const deck = deckForConcept(concept.id);
  const items = useMemo(() => knowItItems(concept, deck, Math.random), [concept.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [outcome, setOutcome] = useState<'pass' | 'fail' | null>(null);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'));
  const finish = async (passed: boolean) => {
    setOutcome(passed ? 'pass' : 'fail');
    try {
      const out = await knowItResult(app.db, profile.id, concept.id, passed);
      await app.refresh();
      if (out.rankUp) app.showRankUp(out.rankUp);
    } catch (e) { void logError('knowit', e); }
    if (passed) playSfx('stamp'); else say(STOP.knowItFail);
  };
  const record = (ok: boolean) => {
    const next = [...results, ok];
    setResults(next);
    const st = knowItState(next);
    if (st === 'fail') void finish(false);
    else if (st === 'pass') void finish(true);
    else setIdx(idx + 1);
  };

  if (!allowed) {
    return (
      <Screen>
        <SpeechBubble text={STOP.knowItBlocked} expression="encouraging" binduSize={72} />
        <ChunkyButton label={STOP.done} onPress={leave} />
      </Screen>
    );
  }
  if (outcome) {
    return (
      <Screen>
        <View style={{ alignItems: 'center', gap: 12, paddingVertical: 12 }}>
          {outcome === 'pass' ? <Stamp icon={concept.icon} size={140} animate label="MASTERED" /> : <Icon name={concept.icon} size={96} />}
        </View>
        <SpeechBubble text={outcome === 'pass' ? STOP.knowItWin : STOP.knowItFail} expression={outcome === 'pass' ? 'happy' : 'encouraging'} binduSize={72} />
        {outcome === 'pass'
          ? <ChunkyButton label={STOP.done} onPress={leave} />
          : <ChunkyButton label={STOP.hookButton} onPress={() => router.replace(`/stop/${concept.id}`)} />}
      </Screen>
    );
  }
  const item = items[idx];
  return (
    <Screen scrollKey={idx}>
      <StepDots total={3} done={idx} current={idx + 1} />
      <T v="label" color="#4A5565">{concept.title}</T>
      {item.kind === 'explain' ? (
        <ExplainBlock key="e" concept={concept} example="world" singleTry helpUsed={false} width={300} say={say}
          onAnswer={() => {}} onFinished={(r) => record(r.correctFirst)} />
      ) : null}
      {item.kind === 'twist' ? <TwistBlock key="t" concept={concept} say={say} onAnswer={() => {}} onFinished={(r) => record(r.correct)} /> : null}
      {item.kind === 'duel' && deck ? (
        <DuelPick key="d" deck={deck} item={deck.items.find((i) => i.id === item.itemId)!} say={say} onAnswer={() => {}} onFinished={(r) => record(r.correct)} />
      ) : null}
      {item.kind === 'name' ? <NameQuick key="n" concept={concept} index={item.index} say={say} onFinished={(r) => record(r.correct)} /> : null}
    </Screen>
  );
}
