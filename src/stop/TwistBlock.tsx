import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import type { Concept } from '../types';
import { T } from '../ui/Text';
import { ChoiceCard, type ChoiceState } from '../ui/ChoiceCard';
import { ChunkyButton } from '../ui/ChunkyButton';
import { SpeechBubble } from '../ui/SpeechBubble';
import { playSfx } from '../ui/sfx';
import { STOP } from '../content/copy';
import { shuffleOptions } from './flow';

/** The Twist: one try. Either way Bindu gives the reason, so a miss is a lesson and never a dead end. */
export function TwistBlock({ concept, say, onAnswer, onFinished }: {
  concept: Concept; say: (t: string) => void;
  onAnswer: (choiceId: string, correct: boolean) => void | Promise<unknown>; onFinished: (r: { correct: boolean }) => void;
}) {
  const opts = useMemo(() => shuffleOptions(concept.twist.options), [concept.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { say(concept.twist.question); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const done = sel !== null;
  const ok = sel === concept.twist.answer;

  const choose = async (id: string) => {
    if (done || busy) return;
    setBusy(true); setSel(id);
    const correct = id === concept.twist.answer;
    playSfx(correct ? 'correct' : 'notquite'); say(concept.twist.reason);
    try { await onAnswer(id, correct); } catch { /* best effort */ }
    setBusy(false);
  };
  const stateOf = (id: string): ChoiceState => (!done ? 'idle' : id === concept.twist.answer ? 'correct' : id === sel ? 'notquite' : 'dim');

  return (
    <View style={{ gap: 12 }}>
      <T v="h2">{STOP.twistTitle}</T>
      <T>{concept.twist.question}</T>
      <View>{opts.map((o) => <ChoiceCard key={o.id} text={o.text} icon={o.icon} state={stateOf(o.id)} disabled={done} onPress={() => choose(o.id)} />)}</View>
      {done ? <SpeechBubble text={concept.twist.reason} expression={ok ? 'happy' : 'encouraging'} binduSize={48} /> : null}
      {done ? <ChunkyButton label={STOP.next} onPress={() => onFinished({ correct: ok })} /> : null}
    </View>
  );
}
