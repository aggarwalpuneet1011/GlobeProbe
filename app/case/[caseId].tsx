import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, TextInput, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/ui/Screen';
import { T } from '../../src/ui/Text';
import { Card } from '../../src/ui/Card';
import { Icon } from '../../src/ui/Icon';
import { StepDots } from '../../src/ui/StepDots';
import { ChunkyButton } from '../../src/ui/ChunkyButton';
import { ChoiceCard } from '../../src/ui/ChoiceCard';
import { BottomSheet } from '../../src/ui/BottomSheet';
import { SpeechBubble } from '../../src/ui/SpeechBubble';
import { Stamp } from '../../src/ui/Stamp';
import { Waveform } from '../../src/ui/Waveform';
import { useHardwareBack } from '../../src/ui/hooks';
import { playSfx } from '../../src/ui/sfx';
import { C, R, SP } from '../../src/ui/theme';
import { useApp } from '../../src/state/app';
import { useLive } from '../../src/state/live';
import * as Q from '../../src/db/queries';
import * as P from '../../src/state/progress';
import { saveAudio } from '../../src/state/files';
import { logError } from '../../src/state/errorlog';
import { getCase } from '../../src/content';
import { CASE, DIARY, FEEDBACK, STOP, SYSTEM } from '../../src/content/copy';
import { hasKey, readAudio, scoreCase } from '../../src/ai/gemini';
import type { CaseResult } from '../../src/ai/validate';
import { canUseAi, judgeBuild, judgeSpoken, shuffledCase, verdictLines, type Judged } from '../../src/case/flow';
import { CaseMap } from '../../src/case/CaseMap';
import { ClueCard } from '../../src/case/Clues';
import { useVoiceRecorder } from '../../src/ui/useVoiceRecorder';
import { useSay } from '../../src/stop/useSay';
import type { CaseFile } from '../../src/types';

type Stage = 'folder' | 'questions' | 'why' | 'twist' | 'verdict';
type Mode = 'speak' | 'type' | 'build';
interface WhyOutcome { mode: Mode; picks?: (string | null)[]; ai?: CaseResult; audioUri?: string | null }

export default function CaseRoute() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const app = useApp();
  const router = useRouter();
  const c = (() => { try { return getCase(String(caseId)); } catch { return null; } })();
  const [state, setState] = useState<'loading' | 'play' | 'retryLater' | 'solved'>('loading');
  const [retry, setRetry] = useState(false);
  useEffect(() => {
    if (!c || !app.active) { router.replace('/(tabs)/home'); return; }
    void (async () => {
      try {
        const rows = (await Q.listCaseAttempts(app.db, app.active!.id)).filter((r) => r.caseId === c.id);
        const solved = rows.some((r) => r.verdict === 'solved');
        if (solved) return setState('solved');
        if (rows.length && !Q.canRetryCase(rows[0].createdAt, false, new Date().toISOString())) return setState('retryLater');
        setRetry(rows.length > 0); setState('play');
      } catch (e) { void logError('case-open', e); setState('play'); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!c || !app.active || state === 'loading') return null;
  if (state === 'retryLater' || state === 'solved') {
    return (
      <Screen>
        <T v="h1">{c.title}</T>
        {state === 'solved' ? <View style={{ alignItems: 'center' }}><Stamp icon="case" size={120} animate={false} label={CASE.folder.replace('{n}', String(c.number))} /></View> : null}
        <SpeechBubble text={state === 'solved' ? FEEDBACK.caseSolved : CASE.retryLater} expression={state === 'solved' ? 'happy' : 'encouraging'} binduSize={72} />
        {state === 'solved' ? <Card><View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Icon name={c.reveal.icon} size={64} /><T style={{ flex: 1 }}>{c.reveal.text}</T></View></Card> : null}
        <ChunkyButton label={STOP.done} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'))} />
      </Screen>
    );
  }
  return <CasePlay base={c} retry={retry} />;
}

function CasePlay({ base, retry }: { base: CaseFile; retry: boolean }) {
  const router = useRouter();
  const app = useApp();
  const live = useLive();
  const { say, stop } = useSay();
  const { width: winW } = useWindowDimensions();
  const width = winW - SP.side * 2;
  const profile = app.active!;
  const c = useMemo(() => (retry ? shuffledCase(base) : base), [base, retry]);
  const [stage, setStage] = useState<Stage>('folder');
  const [qi, setQi] = useState(0);
  const [leave, setLeave] = useState(false);
  const [why, setWhy] = useState<WhyOutcome | null>(null);
  const [twistCorrect, setTwistCorrect] = useState<boolean | null>(null);
  const [result, setResult] = useState<{ judged: Judged; ai: CaseResult | null } | null>(null);
  const [keyOn, setKeyOn] = useState(false);
  useEffect(() => { void hasKey().then(setKeyOn).catch(() => setKeyOn(false)); }, []);
  const aiOk = canUseAi(keyOn, live.online);

  const exit = () => { stop(); if (router.canGoBack()) router.back(); else router.replace('/(tabs)/home'); };
  useHardwareBack(() => { if (stage === 'folder' || stage === 'verdict') { exit(); return true; } setLeave(true); return true; });

  const finishCase = async (w: WhyOutcome, twist: boolean) => {
    const judged = w.mode === 'build' ? judgeBuild(c, w.picks ?? [], twist) : judgeSpoken(c, w.ai?.ideasFound ?? [], w.ai?.misconceptionsFound ?? [], twist);
    setResult({ judged, ai: w.ai ?? null }); setStage('verdict');
    try {
      let audioPath: string | null = null;
      if (w.audioUri) { try { audioPath = await saveAudio(profile.id, w.audioUri); } catch (e) { void logError('case-audio', e); } }
      await Q.saveCaseAttempt(app.db, profile.id, {
        caseId: c.id, verdict: judged.verdict, answerMode: w.mode, transcript: w.ai?.transcript ?? null, ideasFound: w.ai?.ideasFound ?? [],
        misconceptionsFound: w.ai?.misconceptionsFound ?? [], childFeedback: w.ai?.childFeedback ?? null, parentNote: w.ai?.parentNote ?? null, audioPath,
      });
      if (w.ai?.misconceptionsFound.length) await Q.noteMisconceptions(app.db, profile.id, w.ai.misconceptionsFound);
      if (judged.verdict === 'solved') {
        const outs = await P.caseSolved(app.db, profile.id, c);
        const rank = outs.map((o) => o.rankUp).find(Boolean) ?? null;
        await app.refresh(); if (rank) app.showRankUp(rank);
        playSfx('stamp');
      } else await app.refresh();
    } catch (e) { void logError('case-save', e); }
    const l = verdictLines(judged, w.ai?.childFeedback ?? null);
    say(`${l.headline} ${l.detail ?? ''}`);
  };

  const header = (
    <View style={{ gap: 8 }}>
      <T v="label" color="#4A5565">{CASE.folder.replace('{n}', String(c.number))}</T>
      <T v="h1">{c.title}</T>
    </View>
  );

  let body: React.ReactNode = null;
  if (stage === 'folder') {
    body = (
      <>
        {header}
        <CaseMap elements={c.map.elements} width={width} caption={c.map.caption} />
        <T color="#4A5565">{c.map.caption}</T>
        <T v="h2">{CASE.clues}</T>
        {c.clues.map((k, i) => <ClueCard key={i} clue={k} />)}
        <ChunkyButton label={STOP.next} onPress={() => { setQi(0); setStage('questions'); }} />
      </>
    );
  } else if (stage === 'questions') {
    body = <QuestionStep key={qi} c={c} index={qi} say={say} onNext={() => (qi + 1 < c.questions.length ? setQi(qi + 1) : setStage('why'))} />;
  } else if (stage === 'why') {
    body = <BigWhy c={c} aiOk={aiOk} say={say} onDone={(w) => { setWhy(w); setStage('twist'); }} />;
  } else if (stage === 'twist') {
    body = <TwistStep c={c} say={say} onDone={(ok) => { setTwistCorrect(ok); void finishCase(why!, ok); }} />;
  } else if (stage === 'verdict' && result) {
    const l = verdictLines(result.judged, result.ai?.childFeedback ?? null);
    const v = result.judged.verdict;
    body = (
      <>
        {header}
        {v === 'solved' ? <View style={{ alignItems: 'center' }}><Stamp icon="case" size={130} animate label={DIARY.solved} /></View> : null}
        <SpeechBubble text={l.headline} expression={v === 'solved' ? 'happy' : 'encouraging'} binduSize={72} />
        {l.detail ? <Card><T>{l.detail}</T></Card> : null}
        {v === 'not_yet' ? (
          <Card>
            {c.bigWhy.keyIdeas.map((k, i) => <T key={k.id}>{i + 1}. {k.text}</T>)}
          </Card>
        ) : null}
        {v === 'almost' && twistCorrect === false ? <T color="#4A5565">{c.twist.reason}</T> : null}
        {v === 'solved' ? (
          <Card>
            <T v="h2">{CASE.realPlaces}</T>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Icon name={c.reveal.icon} size={72} /><T style={{ flex: 1 }}>{c.reveal.text}</T></View>
          </Card>
        ) : <T color="#4A5565">{CASE.retryLater}</T>}
        <ChunkyButton label={STOP.done} onPress={exit} />
      </>
    );
  }

  const progressDone = stage === 'folder' ? 0 : stage === 'questions' ? 1 : stage === 'why' ? 2 : stage === 'twist' ? 3 : 4;
  return (
    <Screen scrollKey={`${stage}${qi}`}>
      {stage !== 'verdict' ? <StepDots total={4} done={progressDone} current={Math.min(4, progressDone + 1)} /> : null}
      {body}
      <BottomSheet visible={leave} onClose={() => setLeave(false)} scroll={false}>
        <View style={{ padding: 20, gap: 14 }}>
          <T v="h2">Leave this case?</T>
          <T>{STOP.leaveBody}</T>
          <ChunkyButton label={STOP.keepGoing} onPress={() => setLeave(false)} />
          <ChunkyButton kind="ghost" label={STOP.leave} onPress={() => { setLeave(false); exit(); }} />
        </View>
      </BottomSheet>
    </Screen>
  );
}

function QuestionStep({ c, index, say, onNext }: { c: CaseFile; index: number; say: (t: string) => void; onNext: () => void }) {
  const q = c.questions[index];
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { say(q.prompt); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const done = sel !== null;
  return (
    <View style={{ gap: 12 }}>
      <T v="h2">{q.prompt}</T>
      <View>{q.options.map((o) => (
        <ChoiceCard key={o.id} text={o.text} disabled={done}
          state={!done ? 'idle' : o.id === q.answer ? 'correct' : o.id === sel ? 'notquite' : 'dim'}
          onPress={() => { setSel(o.id); playSfx(o.id === q.answer ? 'correct' : 'notquite'); }} />
      ))}</View>
      {done && sel !== q.answer && q.reason ? <SpeechBubble text={q.reason} expression="encouraging" binduSize={48} /> : null}
      {done ? <ChunkyButton label={STOP.next} onPress={onNext} /> : null}
    </View>
  );
}

function TwistStep({ c, say, onDone }: { c: CaseFile; say: (t: string) => void; onDone: (ok: boolean) => void }) {
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { say(c.twist.prompt); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const done = sel !== null; const ok = sel === c.twist.answer;
  return (
    <View style={{ gap: 12 }}>
      <T v="h2">{CASE.twist}</T>
      <T>{c.twist.prompt}</T>
      <View>{c.twist.options.map((o) => (
        <ChoiceCard key={o.id} text={o.text} disabled={done}
          state={!done ? 'idle' : o.id === c.twist.answer ? 'correct' : o.id === sel ? 'notquite' : 'dim'}
          onPress={() => { setSel(o.id); playSfx(o.id === c.twist.answer ? 'correct' : 'notquite'); say(c.twist.reason); }} />
      ))}</View>
      {done ? <SpeechBubble text={c.twist.reason} expression={ok ? 'happy' : 'encouraging'} binduSize={48} /> : null}
      {done ? <ChunkyButton label={STOP.next} onPress={() => onDone(ok)} /> : null}
    </View>
  );
}

function BigWhy({ c, aiOk, say, onDone }: { c: CaseFile; aiOk: boolean; say: (t: string) => void; onDone: (w: WhyOutcome) => void }) {
  const [mode, setMode] = useState<Mode>(aiOk ? 'speak' : 'build');
  const [fell, setFell] = useState(false);          // AI failed once: stay on Build-it for this case
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [heard, setHeard] = useState<{ ai: CaseResult; uri: string } | null>(null);
  const [note, setNote] = useState('');
  const abort = useRef<AbortController | null>(null);
  useEffect(() => { say(`${CASE.explain} ${c.bigWhy.prompt}`); if (!aiOk) setNote(SYSTEM.offlineCase); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const canAi = aiOk && !fell;
  useEffect(() => { if (!canAi && mode !== 'build') setMode('build'); }, [canAi, mode]);

  const fallBack = (why: string) => { void logError('case-ai', why); setFell(true); setMode('build'); setBusy(false); setNote(SYSTEM.offlineCase); };

  const rec = useVoiceRecorder(45, (r) => { if (r) void submitAudio(r); });
  const submitAudio = async (r: { uri: string; silent: boolean }) => {
    if (r.silent) { setNote(SYSTEM.heardNothing); return; }
    setBusy(true); setNote('');
    abort.current = new AbortController();
    try {
      const audio = await readAudio(r.uri);
      const res = await scoreCase(c, '', { audio, signal: abort.current.signal });
      if (!res.ok) { if (res.error === 'CANCELLED') { setBusy(false); return; } fallBack(res.error); return; }
      setHeard({ ai: res.data, uri: r.uri }); setBusy(false);
    } catch (e) { fallBack(String(e)); }
  };
  const submitText = async () => {
    if (!text.trim()) return;
    setBusy(true); setNote('');
    abort.current = new AbortController();
    const res = await scoreCase(c, text.trim(), { signal: abort.current.signal });
    if (!res.ok) { if (res.error === 'CANCELLED') { setBusy(false); return; } fallBack(res.error); return; }
    onDone({ mode: 'type', ai: res.data });
  };
  const startMic = async () => { setNote(''); const ok = await rec.start(); if (!ok) setNote(rec.state === 'denied' ? SYSTEM.micDenied : SYSTEM.cantReachMic); };
  const stopMic = async () => { const r = await rec.stop(); if (r) await submitAudio(r); };

  if (busy) {
    return (
      <View style={{ gap: 14 }}>
        <SpeechBubble text="Let me think about that..." expression="thinking" binduSize={72} />
        <ChunkyButton kind="ghost" label="Never mind" onPress={() => { abort.current?.abort(); setBusy(false); }} />
      </View>
    );
  }
  if (heard) {
    return (
      <View style={{ gap: 14 }}>
        <T v="h2">{CASE.heard}</T>
        <Card><T>“{heard.ai.transcript || '...'}”</T></Card>
        <ChunkyButton label={CASE.thatsRight} onPress={() => onDone({ mode: 'speak', ai: heard.ai, audioUri: heard.uri })} />
        <ChunkyButton kind="secondary" label={CASE.tryAgain} onPress={() => setHeard(null)} />
        <ChunkyButton kind="ghost" label={CASE.typeIt} icon="keyboard" onPress={() => { setText(heard.ai.transcript); setHeard(null); setMode('type'); }} />
      </View>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      <T v="h2">{CASE.bigWhy}</T>
      <T>{CASE.explain}</T>
      <Card><T v="choice">{c.bigWhy.prompt}</T></Card>
      {canAi ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([['speak', CASE.speak, 'mic'], ['type', CASE.type, 'keyboard'], ['build', CASE.build, 'layers']] as const).map(([m, label, icon]) => (
            <Pressable key={m} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: mode === m }} onPress={() => setMode(m)}
              style={{ flex: 1, minHeight: 72, borderRadius: R.choice, borderWidth: mode === m ? 3 : 2, borderColor: mode === m ? C.sea : C.ink, backgroundColor: mode === m ? C.selectedFill : C.paper, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              <Icon name={icon} size={28} /><T v="label">{label}</T>
            </Pressable>
          ))}
        </View>
      ) : null}
      {note ? <SpeechBubble text={note} expression="curious" binduSize={48} /> : null}

      {mode === 'speak' ? (
        <View style={{ gap: 12 }}>
          {rec.state === 'recording' ? <Waveform level={rec.level} /> : null}
          {rec.state === 'recording' ? <T center color="#4A5565">{Math.floor(rec.seconds)} / 45 s</T> : null}
          {rec.state === 'recording'
            ? <ChunkyButton label="Done talking" icon="pause" onPress={stopMic} />
            : <ChunkyButton label={CASE.speak} icon="mic" onPress={startMic} />}
        </View>
      ) : null}

      {mode === 'type' ? (
        <View style={{ gap: 12 }}>
          <TextInput value={text} onChangeText={setText} maxLength={280} multiline placeholder="Type your idea" placeholderTextColor="#8A94A3" accessibilityLabel="Type your answer"
            style={{ minHeight: 120, borderRadius: R.choice, borderWidth: 2, borderColor: C.ink, backgroundColor: C.paper, padding: 14, fontFamily: 'Nunito_600SemiBold', fontSize: 17, color: C.ink, textAlignVertical: 'top' }} />
          <T v="label" color="#4A5565" center>{text.length} / 280</T>
          <ChunkyButton label={STOP.check} disabled={!text.trim()} onPress={submitText} />
        </View>
      ) : null}

      {mode === 'build' ? <BuildIt c={c} onDone={(picks) => onDone({ mode: 'build', picks })} /> : null}
    </View>
  );
}

function BuildIt({ c, onDone }: { c: CaseFile; onDone: (picks: (string | null)[]) => void }) {
  const [picks, setPicks] = useState<(string | null)[]>([null, null, null]);
  const [open, setOpen] = useState<number | null>(null);
  const full = picks.every(Boolean);
  const slot = open !== null ? c.bigWhy.chips[open] : null;
  return (
    <View style={{ gap: 10 }}>
      {c.bigWhy.chips.map((s, i) => {
        const chosen = s.options.find((o) => o.id === picks[i]);
        return (
          <Pressable key={i} accessibilityRole="button" accessibilityLabel={`${s.label}. ${chosen ? chosen.text : CASE.slotHint}`} onPress={() => setOpen(i)}
            style={{ minHeight: 64, borderRadius: R.choice, borderWidth: 2, borderColor: C.ink, backgroundColor: chosen ? C.selectedFill : C.paper, paddingHorizontal: 14, paddingVertical: 8, justifyContent: 'center' }}>
            <T v="label" color="#4A5565">{s.label}</T>
            <T v="choice">{chosen ? chosen.text : CASE.slotHint}</T>
          </Pressable>
        );
      })}
      <ChunkyButton label={STOP.check} disabled={!full} onPress={() => onDone(picks)} />
      <BottomSheet visible={open !== null} onClose={() => setOpen(null)}>
        {slot ? (
          <View style={{ gap: 8 }}>
            <T v="h2">{slot.label}</T>
            {slot.options.map((o) => (
              <ChoiceCard key={o.id} text={o.text} state={picks[open!] === o.id ? 'selected' : 'idle'}
                onPress={() => { setPicks((p) => p.map((x, k) => (k === open ? o.id : x))); setOpen(null); }} />
            ))}
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}
