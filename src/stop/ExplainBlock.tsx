import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import type { Concept, ExampleKind } from '../types';
import type { SimSession } from '../sims/engine';
import { T } from '../ui/Text';
import { Card } from '../ui/Card';
import { ChoiceCard, type ChoiceState } from '../ui/ChoiceCard';
import { ChunkyButton } from '../ui/ChunkyButton';
import { SpeechBubble } from '../ui/SpeechBubble';
import { playSfx } from '../ui/sfx';
import { C } from '../ui/theme';
import { FEEDBACK, STOP } from '../content/copy';
import { buildExplainOptions, judgeExplain, reshuffle, type ExplainOption } from './flow';
import { SimPanel } from './SimPanel';
import { pick } from '../util/rng';

export interface ExplainAnswer { correct: boolean; firstTry: boolean; withHelp: boolean; choiceId: string; misconceptionId: string | null; tries: number }
type Phase = 'ask' | 'replay' | 'correct' | 'revealed';

/**
 * "Why did that happen?" with 3 reason cards.
 * First wrong try: highlight replay then the same cards in a new order. Second wrong try: show the right card and move on.
 * `singleTry` (reviews, "I know this!") skips the replay: a miss goes straight to the reveal.
 */
export function ExplainBlock({ concept, session, width, example, singleTry, helpUsed, say, onAnswer, onFinished }: {
  concept: Concept; session?: SimSession; width: number; example?: ExampleKind | null; singleTry?: boolean; helpUsed: boolean;
  say: (t: string) => void; onAnswer: (a: ExplainAnswer) => void | Promise<unknown>; onFinished: (r: { correctFirst: boolean }) => void;
}) {
  const [opts, setOpts] = useState<ExplainOption[]>(() => buildExplainOptions(concept));
  const [sel, setSel] = useState<string | null>(null);
  const [wrongId, setWrongId] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [phase, setPhase] = useState<Phase>('ask');
  const [msg, setMsg] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const hl = concept.explain.highlight;
  const right = concept.explain.correct;

  useEffect(() => { say(concept.explain.question); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stop the highlight replay at its end (it plays from `start` for the key seconds only).
  useEffect(() => {
    if (!session || phase !== 'replay') return;
    const id = setInterval(() => { if (session.sim.time >= hl.end) { session.pause(); clearInterval(id); } }, 80);
    return () => clearInterval(id);
  }, [session, phase, hl.end]);

  const startReplay = () => { if (!session) return; session.speed = 1; session.seekTo(hl.start); };

  const check = async () => {
    const o = opts.find((x) => x.id === sel);
    if (!o || busy) return;
    setBusy(true);
    const correct = o.misconceptionId === null;
    const firstTry = tries === 0;
    try { await onAnswer({ correct, firstTry, withHelp: helpUsed, choiceId: o.id, misconceptionId: o.misconceptionId, tries }); } catch { /* progress is best effort */ }
    setBusy(false);
    const v = singleTry && !correct ? ({ action: 'reveal' } as const) : judgeExplain(tries, correct, helpUsed);
    if (v.action === 'correct') {
      const text = v.feedback === 'first' ? pick(FEEDBACK.correctFirst) : pick(FEEDBACK.correctSecond);
      setMsg(text); setPhase('correct'); playSfx('correct'); say(text);
    } else if (v.action === 'replay') {
      setWrongId(o.id); setMsg(FEEDBACK.explainNotQuite1); setPhase('replay'); playSfx('notquite');
      say(`${FEEDBACK.explainNotQuite1} ${hl.caption}`); startReplay();
    } else {
      setWrongId(o.id); setPhase('revealed'); playSfx('notquite');
      const text = `${FEEDBACK.explainNotQuite2a} ${right.text} ${FEEDBACK.explainNotQuite2b}`;
      setMsg(text); say(text);
    }
  };

  const tryAgain = () => { setOpts((cur) => reshuffle(cur)); setSel(null); setWrongId(null); setTries(1); setPhase('ask'); setMsg(''); };

  const stateOf = (o: ExplainOption): ChoiceState => {
    if (phase === 'correct') return o.id === sel ? 'correct' : 'dim';
    if (phase === 'revealed') return o.misconceptionId === null ? 'correct' : o.id === wrongId ? 'notquite' : 'dim';
    if (phase === 'replay') return o.id === wrongId ? 'notquite' : 'dim';
    return o.id === sel ? 'selected' : 'idle';
  };
  const simW = Math.round(width * (phase === 'replay' ? 0.8 : 0.62));
  const showSim = !!session && (phase === 'replay' || (tries >= 1 && phase === 'ask'));

  return (
    <View style={{ gap: 12 }}>
      <T v="h2">{STOP.explainTitle}</T>
      {example ? <Card fill={C.selectedFill}><T v="label" color={C.ink2}>Think about this one:</T><T>{concept.explain.examples[example]}</T></Card> : null}
      <T>{concept.explain.question}</T>

      {showSim ? (
        <View style={{ gap: 8 }}>
          <SimPanel concept={concept} session={session!} width={simW} enabled={false} controls={false} highlight={hl.layer} caption={hl.caption} />
          {phase === 'replay' ? <ChunkyButton small kind="ghost" icon="replay" label={STOP.replay} onPress={startReplay} /> : null}
        </View>
      ) : null}

      {phase !== 'replay' ? (
        <View>
          {opts.map((o) => (
            <ChoiceCard key={o.id} text={o.text} state={stateOf(o)} disabled={phase !== 'ask' || busy} onPress={() => setSel(o.id)} />
          ))}
        </View>
      ) : null}

      {msg ? <SpeechBubble text={msg} expression={phase === 'correct' ? 'happy' : phase === 'revealed' ? 'encouraging' : 'curious'} binduSize={48} /> : null}

      {phase === 'ask' ? <ChunkyButton label={STOP.check} disabled={!sel || busy} onPress={check} /> : null}
      {phase === 'replay' ? <ChunkyButton label={STOP.tryAgain} onPress={tryAgain} /> : null}
      {phase === 'correct' || phase === 'revealed' ? <ChunkyButton label={STOP.next} onPress={() => onFinished({ correctFirst: phase === 'correct' && tries === 0 })} /> : null}
    </View>
  );
}
