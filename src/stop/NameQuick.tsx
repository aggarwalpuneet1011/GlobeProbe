import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { Concept } from '../types';
import { T } from '../ui/Text';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { ChoiceCard, type ChoiceState } from '../ui/ChoiceCard';
import { ChunkyButton } from '../ui/ChunkyButton';
import { playSfx } from '../ui/sfx';
import { STOP } from '../content/copy';
import { buildNameQuestions } from './flow';

/** One Name-it question answered once (used by Warm-up reviews and as the "I know this!" fallback when a concept has no Duel deck). */
export function NameQuick({ concept, index, say, onAnswer, onFinished }: {
  concept: Concept; index: number; say: (t: string) => void;
  onAnswer?: (choice: string, correct: boolean) => void | Promise<unknown>; onFinished: (r: { correct: boolean }) => void;
}) {
  const q = useMemo(() => buildNameQuestions([concept.nameIt[index]])[0], [concept.id, index]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = useState<number | null>(null);
  const done = sel !== null;
  const stateOf = (i: number): ChoiceState => (!done ? 'idle' : i === q.answer ? 'correct' : i === sel ? 'notquite' : 'dim');
  return (
    <View style={{ gap: 12 }}>
      <T v="h2">{STOP.nameTitle}</T>
      <Card><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {[q.item.promptIcon, ...(q.item.promptIcons ?? [])].filter(Boolean).map((n) => <Icon key={n} name={n} size={64} />)}
        <T v="h2" style={{ flex: 1 }}>{q.item.prompt}</T>
      </View></Card>
      <View>{q.options.map((o, i) => (
        <ChoiceCard key={o.text} text={o.text} icon={o.icon} state={stateOf(i)} disabled={done}
          onPress={() => { setSel(i); playSfx(i === q.answer ? 'correct' : 'notquite'); say(o.text); void Promise.resolve(onAnswer?.(o.text, i === q.answer)).catch(() => {}); }} />
      ))}</View>
      {done ? <ChunkyButton label={STOP.next} onPress={() => onFinished({ correct: sel === q.answer })} /> : null}
    </View>
  );
}
