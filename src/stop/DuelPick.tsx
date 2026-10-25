import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { DuelDeck, DuelItem } from '../types';
import { T } from '../ui/Text';
import { ChoiceCard, type ChoiceState } from '../ui/ChoiceCard';
import { ChunkyButton } from '../ui/ChunkyButton';
import { SpeechBubble } from '../ui/SpeechBubble';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { playSfx } from '../ui/sfx';
import type { SoundId } from '../ui/assets';
import { STOP } from '../content/copy';

/** One Pair Duel item answered by tapping a side (used by "I know this!"; the Duel screen has its own drag version). */
export function DuelPick({ deck, item, say, onAnswer, onFinished }: {
  deck: DuelDeck; item: DuelItem; say: (t: string) => void;
  onAnswer: (sideId: string, correct: boolean) => void | Promise<unknown>; onFinished: (r: { correct: boolean }) => void;
}) {
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { if (item.kind === 'sound' && item.sound) playSfx(item.sound as SoundId); else if (item.text) say(item.text); }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = sel !== null;
  const ok = sel === item.side;
  const choose = async (id: string) => {
    if (done) return;
    setSel(id); const correct = id === item.side; playSfx(correct ? 'correct' : 'notquite'); say(item.reason);
    try { await onAnswer(id, correct); } catch { /* best effort */ }
  };
  const stateOf = (id: string): ChoiceState => (!done ? 'idle' : id === item.side ? 'correct' : id === sel ? 'notquite' : 'dim');
  return (
    <View style={{ gap: 12 }}>
      <T v="h2">{deck.title}</T>
      <Card>
        {item.kind === 'sound' ? (
          <View style={{ alignItems: 'center', gap: 8 }}>
            <Icon name="speaker" size={48} />
            <ChunkyButton small kind="ghost" label="Listen again" icon="speaker" onPress={() => item.sound && playSfx(item.sound as SoundId)} />
          </View>
        ) : <T v="h2" center>{item.text}</T>}
      </Card>
      <View>{deck.sides.map((s) => <ChoiceCard key={s.id} text={s.label} icon={s.icon} state={stateOf(s.id)} disabled={done} onPress={() => choose(s.id)} />)}</View>
      {done ? <SpeechBubble text={item.reason} expression={ok ? 'happy' : 'encouraging'} binduSize={48} /> : null}
      {done ? <ChunkyButton label={STOP.next} onPress={() => onFinished({ correct: ok })} /> : null}
    </View>
  );
}
