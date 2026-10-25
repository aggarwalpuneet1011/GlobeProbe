import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../src/ui/Screen';
import { T } from '../src/ui/Text';
import { StepDots } from '../src/ui/StepDots';
import { ChunkyButton } from '../src/ui/ChunkyButton';
import { SpeechBubble } from '../src/ui/SpeechBubble';
import { useHardwareBack } from '../src/ui/hooks';
import { useApp } from '../src/state/app';
import * as P from '../src/state/progress';
import { logError } from '../src/state/errorlog';
import { getConcept, deckForConcept } from '../src/content';
import { HOME } from '../src/content/copy';
import { chooseReviewItem, dueReviews, type ReviewItem } from '../src/learning/scheduler';
import { ExplainBlock } from '../src/stop/ExplainBlock';
import { DuelPick } from '../src/stop/DuelPick';
import { NameQuick } from '../src/stop/NameQuick';
import { useSay } from '../src/stop/useSay';
import { nowIso } from '../src/util/time';
import { useWindowDimensions } from 'react-native';

/** Warm-up: up to 2 due reviews, one item each. Wrong answers reset the interval to 1 day and may lower the level, never below Named. */
export default function Review() {
  const router = useRouter();
  const app = useApp();
  const { say, stop } = useSay();
  const { width } = useWindowDimensions();
  const [plan] = useState<ReviewItem[]>(() => {
    const now = nowIso();
    return dueReviews(app.reviews, app.progress, now).map((r) => {
      const c = getConcept(r.conceptId);
      return chooseReviewItem(c, deckForConcept(c.id), app.progressOf(c.id), Math.random);
    });
  });
  const [i, setI] = useState(0);
  const profile = app.active;
  const leave = () => { stop(); router.replace('/(tabs)/home'); };
  useHardwareBack(() => { leave(); return true; });
  useEffect(() => { if (!plan.length) router.replace('/(tabs)/home'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!profile || !plan.length) return null;

  const done = i >= plan.length;
  const item = plan[i];
  const concept = item ? getConcept(item.conceptId) : null;

  const save = async (fn: () => Promise<P.Outcome>) => {
    try { const out = await fn(); await app.refresh(); if (out.rankUp) app.showRankUp(out.rankUp); return out; } catch (e) { void logError('review', e); return null; }
  };
  const close = async (correct: boolean) => {
    if (!concept) return;
    try { await P.scheduleReviewResult(app.db, profile.id, concept.id, correct); } catch (e) { void logError('review-schedule', e); }
    setI(i + 1);
  };

  if (done) {
    return (
      <Screen>
        <SpeechBubble text="Nice warm-up. Ready for a Stop?" expression="happy" binduSize={72} />
        <ChunkyButton label={HOME.continue} onPress={leave} />
      </Screen>
    );
  }
  return (
    <Screen scrollKey={i}>
      <T v="h2">{HOME.warmUp}</T>
      <StepDots total={plan.length} done={i} current={i + 1} />
      <T v="label" color="#4A5565">{concept!.title}</T>
      {item.kind === 'explain' ? (
        <ExplainBlock key={i} concept={concept!} example={item.example} singleTry helpUsed={false} width={width - 40} say={say}
          onAnswer={(a) => save(() => P.answerExplain(app.db, profile.id, concept!.id, { ...a, example: item.example, itemId: `${concept!.id}:review:${item.example}` }, nowIso(), 'review'))}
          onFinished={(r) => close(r.correctFirst)} />
      ) : null}
      {item.kind === 'duel' ? (() => {
        const deck = deckForConcept(concept!.id)!; const it = deck.items.find((x) => x.id === item.itemId)!;
        return <DuelPick key={i} deck={deck} item={it} say={say}
          onAnswer={(side, ok) => save(() => P.answerReview(app.db, profile.id, concept!.id, 'duel', it.id, side, ok))}
          onFinished={(r) => close(r.correct)} />;
      })() : null}
      {item.kind === 'name' ? (
        <NameQuick key={i} concept={concept!} index={item.index} say={say}
          onAnswer={(choice, ok) => save(() => P.answerReview(app.db, profile.id, concept!.id, 'name', `${concept!.id}:name:${item.index}`, choice, ok))}
          onFinished={(r) => close(r.correct)} />
      ) : null}
    </Screen>
  );
}
