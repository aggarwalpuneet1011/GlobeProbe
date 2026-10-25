// The six Stop steps. Each is a plain component; the screen in app/stop/[conceptId].tsx owns the state and the saving.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import type { Concept } from '../types';
import type { SimSession } from '../sims/engine';
import { windGame, DIR_WORDS, type Dir, type WindSim } from '../sims/wind';
import { T } from '../ui/Text';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { ChoiceCard, type ChoiceState } from '../ui/ChoiceCard';
import { ChunkyButton } from '../ui/ChunkyButton';
import { SpeechBubble } from '../ui/SpeechBubble';
import { WordCard } from '../ui/WordCard';
import { Stamp } from '../ui/Stamp';
import { Icon } from '../ui/Icon';
import { playSfx } from '../ui/sfx';
import { PHOTOS } from '../ui/photos.generated';
import type { SoundId } from '../ui/assets';
import { C } from '../ui/theme';
import { STOP } from '../content/copy';
import { buildNameQuestions, shuffleOptions, predictReveal, type StampKind } from './flow';
import { SimPanel } from './SimPanel';

export interface StepBase { concept: Concept; session: SimSession; width: number; say: (t: string) => void }

// ------------------------------------------------------------------ 1 Hook
export function HookStep({ concept, session, width, say, onNext }: StepBase & { onNext: () => void }) {
  const [wordIdx, setWordIdx] = useState<number | null>(null);
  const photo = PHOTOS[concept.hook.image] ?? PHOTOS[concept.hook.image.replace(/\.[a-z]+$/, '')];
  useEffect(() => {
    session.restore();
    say(concept.hook.lines.join(' '));
    const id = setTimeout(() => setWordIdx(0), 900);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const closeWord = () => setWordIdx((i) => (i !== null && i + 1 < concept.words.length ? i + 1 : null));
  const w = wordIdx !== null ? concept.words[wordIdx] : null;
  return (
    <View style={{ gap: 12 }}>
      <T v="display">{concept.title}</T>
      {photo ? (
        <Image source={photo} accessibilityLabel={concept.hook.alt} style={{ width, height: Math.round(width * 0.75), borderRadius: 20, borderWidth: 2, borderColor: C.ink }} resizeMode="cover" />
      ) : (
        <SimPanel concept={concept} session={session} width={width} enabled={false} controls={false} />
      )}
      {concept.hook.lines.map((l, i) => (
        <SpeechBubble key={i} text={l} expression={i === 0 ? 'neutral' : 'curious'} binduSize={i === 0 ? 48 : 0} />
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {concept.words.map((x, i) => <Chip key={x.word} label={x.word} icon={x.icon} onPress={() => setWordIdx(i)} />)}
      </View>
      <ChunkyButton label={STOP.hookButton} onPress={onNext} />
      <WordCard visible={!!w} word={w?.word ?? ''} icon={w?.icon} meaning={w?.meaning ?? ''} onClose={closeWord} />
    </View>
  );
}

// ------------------------------------------------------------------ 2 Predict
export function PredictStep({ concept, session, width, say, onLock, onNext }: StepBase & { onLock: (choiceId: string) => void | Promise<unknown>; onNext: () => void }) {
  const opts = useMemo(() => shuffleOptions(concept.predict.options), [concept.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  useEffect(() => { session.restore(); say(concept.predict.question); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const lock = async () => {
    if (!sel || locked) return;
    setLocked(true); say(STOP.lockedIn);
    try { await onLock(sel); } catch { /* best effort */ }
  };
  return (
    <View style={{ gap: 12 }}>
      <T v="h2">{concept.predict.question}</T>
      <SimPanel concept={concept} session={session} width={width} enabled={false} controls={false} />
      <View>
        {opts.map((o) => (
          <ChoiceCard key={o.id} text={o.text} icon={o.icon} disabled={locked}
            state={locked ? (o.id === sel ? 'selected' : 'dim') : o.id === sel ? 'selected' : 'idle'} onPress={() => setSel(o.id)} />
        ))}
      </View>
      {locked ? <SpeechBubble text={STOP.lockedIn} expression="happy" binduSize={48} /> : null}
      {locked ? <ChunkyButton label={STOP.next} onPress={onNext} /> : <ChunkyButton label={STOP.lockIt} disabled={!sel} onPress={lock} />}
    </View>
  );
}

// ------------------------------------------------------------------ 3 Watch
export function WatchStep({ concept, session, sink, width, say, predicted, onWatched, onNext }: StepBase & {
  sink: React.MutableRefObject<((id: string) => void) | null>; predicted: string | null; onWatched: () => void; onNext: () => void;
}) {
  const [caption, setCaption] = useState(concept.watch.instruction);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [fast, setFast] = useState(false);
  const [done, setDone] = useState(false);
  const [manual, setManual] = useState(false);
  const reported = useRef(false);
  const reveal = useMemo(() => predictReveal(concept, predicted), [concept.id, predicted]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    session.restore(); session.speed = 1;
    sink.current = (id) => { const t = concept.watch.captions[id]; if (t) { setCaption(t); say(t); } };
    const poll = setInterval(() => {
      if (session.scriptDone) { setDone(true); if (!reported.current) { reported.current = true; onWatched(); } }
    }, 150);
    return () => { clearInterval(poll); sink.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (done) say(reveal.text); }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const takeOver = () => { if (session.manual) return; session.takeOver(); setManual(true); setRunning(true); setPaused(false); };
  const play = () => { if (!running) { session.replay(); setRunning(true); setPaused(false); say(concept.watch.instruction); } else { if (session.playing) { session.pause(); setPaused(true); } else { session.play(); setPaused(false); } } };
  const replay = () => { session.speed = fast ? 2 : 1; session.replay(); setRunning(true); setPaused(false); setDone(false); setManual(false); setCaption(concept.watch.instruction); };
  const toggleFast = () => { const f = !fast; setFast(f); session.speed = f ? 2 : 1; };

  return (
    <View style={{ gap: 12 }}>
      <T v="h2">{concept.watch.instruction}</T>
      <SimPanel concept={concept} session={session} width={width} enabled={done || manual} controlsLive onUserControl={takeOver} />
      <SpeechBubble text={done ? reveal.text : caption} expression={done ? (reveal.matched ? 'happy' : 'curious') : 'thinking'} binduSize={48} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1.3 }}><ChunkyButton small kind="primary" icon={running && !paused ? 'pause' : 'play'} label={!running ? STOP.play : paused ? STOP.play : STOP.pause} onPress={play} /></View>
        <View style={{ flex: 1 }}><ChunkyButton small kind="ghost" icon="replay" label={STOP.replay} disabled={!running} onPress={replay} /></View>
        <View style={{ flex: 0.8 }}><ChunkyButton small kind={fast ? 'secondary' : 'ghost'} label={STOP.speed} accessibilityLabel="Double speed" onPress={toggleFast} /></View>
      </View>
      {done ? <ChunkyButton label={STOP.next} onPress={onNext} /> : null}
    </View>
  );
}

// ------------------------------------------------------------------ 5 Name it
export interface NameAnswer { itemId: string; choice: string; correct: boolean; firstTry: boolean }
export function NameItStep({ concept, session, width, say, onAnswer, onNext }: StepBase & { onAnswer: (a: NameAnswer) => void | Promise<unknown>; onNext: () => void }) {
  const qs = useMemo(() => buildNameQuestions(concept.nameIt), [concept.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);
  const [wrong, setWrong] = useState<number[]>([]);
  const [right, setRight] = useState<number | null>(null);
  const [hint, setHint] = useState('');
  const [glow, setGlow] = useState(false);
  const q = qs[i];
  const itemId = `${concept.id}:name:${i}`;

  useEffect(() => {
    setWrong([]); setRight(null); setHint(''); setGlow(false);
    say(q.item.kind === 'wind_game' ? STOP.windMake.replace('{dir}', DIR_WORDS[q.item.target as Dir]) : q.item.prompt);
    if (q.item.kind === 'wind_game') { session.restore(); session.sim.setControl('windFrom', q.item.target === 'W' ? 'E' : 'W'); session.play(); }
    if (q.item.promptSound) playSfx(q.item.promptSound as SoundId);
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = () => { if (i + 1 < qs.length) setI(i + 1); else onNext(); };
  const record = (choice: string, correct: boolean, firstTry: boolean) => { void Promise.resolve(onAnswer({ itemId, choice, correct, firstTry })).catch(() => {}); };

  const tap = (idx: number) => {
    if (right !== null || wrong.includes(idx)) return;
    const correct = idx === q.answer;
    record(q.options[idx].text, correct, wrong.length === 0);
    if (correct) { setRight(idx); playSfx('correct'); setHint(''); }
    else { setWrong((w) => [...w, idx]); playSfx('notquite'); setHint(STOP.tryAgain); }
  };

  const checkWind = () => {
    const target = q.item.target as Dir; const from = (session.sim as WindSim).from;
    const res = windGame(target, from);
    record(`windFrom=${from}`, res === 'correct', wrong.length === 0);
    if (res === 'correct') { setRight(0); setGlow(false); playSfx('correct'); setHint(`Yes. Wind from the ${DIR_WORDS[target]}.`); say(`Yes. Wind from the ${DIR_WORDS[target]}.`); }
    else {
      setWrong((w) => [...w, 1]); playSfx('notquite');
      if (res === 'wentTo') { const t = STOP.windWentTo.replace('{dir}', DIR_WORDS[target]); setHint(t); say(t); setGlow(true); } else { setHint(STOP.tryAgain); setGlow(false); }
    }
  };

  const stateOf = (idx: number): ChoiceState => (right === idx ? 'correct' : wrong.includes(idx) ? 'notquite' : right !== null ? 'dim' : 'idle');
  const wind = q.item.kind === 'wind_game';

  return (
    <View style={{ gap: 12 }}>
      <T v="h2">{STOP.nameTitle}</T>
      {wind ? (
        <>
          <T v="h2">{STOP.windMake.replace('{dir}', DIR_WORDS[q.item.target as Dir])}</T>
          <SimPanel concept={concept} session={session} width={width} enabled={right === null} controls={false} flags={{ glowTail: glow }} />
        </>
      ) : (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {[q.item.promptIcon, ...(q.item.promptIcons ?? [])].filter(Boolean).map((n) => <Icon key={n} name={n} size={64} />)}
            <T v="h2" style={{ flex: 1 }}>{q.item.prompt}</T>
            {q.item.promptSound ? <ChunkyButton small kind="ghost" icon="speaker" label="Listen" onPress={() => playSfx(q.item.promptSound as SoundId)} style={{ width: 120 }} /> : null}
          </View>
        </Card>
      )}
      {!wind ? <View>{q.options.map((o, idx) => <ChoiceCard key={o.text} text={o.text} icon={o.icon} state={stateOf(idx)} disabled={right !== null || wrong.includes(idx)} onPress={() => tap(idx)} />)}</View> : null}
      {hint ? <SpeechBubble text={hint} expression={right !== null ? 'happy' : 'curious'} binduSize={48} /> : null}
      {wind && right === null ? <ChunkyButton label={STOP.checkIt} onPress={checkWind} /> : null}
      {right !== null ? <ChunkyButton label={STOP.next} onPress={advance} /> : null}
    </View>
  );
}

// ------------------------------------------------------------------ 6 Stamp
export function StampStep({ concept, kind, onLab, onMission, onDone }: { concept: Concept; kind: StampKind; onLab: () => void; onMission: () => void; onDone: () => void }) {
  const line = kind === 'full' ? STOP.stamped : kind === 'half' ? STOP.half : STOP.spotted;
  return (
    <View style={{ gap: 14, alignItems: 'stretch' }}>
      <View style={{ alignItems: 'center', gap: 12, paddingVertical: 8 }}>
        {kind === 'spotted' ? (
          <View accessible accessibilityLabel="Spotted badge" style={{ alignItems: 'center', gap: 6 }}>
            <Icon name={concept.icon} size={96} />
          </View>
        ) : <Stamp icon={concept.icon} size={140} animate half={kind === 'half'} />}
        <T v="display" center>{kind === 'spotted' ? STOP.spotted : kind === 'full' ? STOP.stamped : 'Explained once!'}</T>
        {kind === 'half' ? <T center color={C.ink2}>{STOP.half}</T> : null}
      </View>
      <Card onPress={onLab} accessibilityLabel={STOP.playLab}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Icon name="lab" size={48} /><T v="h2">{STOP.playLab}</T></View></Card>
      <Card onPress={onMission} accessibilityLabel={STOP.todaysMission}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Icon name="camera" size={48} /><T v="h2">{STOP.todaysMission}</T></View></Card>
      <ChunkyButton label={STOP.done} onPress={onDone} />
    </View>
  );
}
