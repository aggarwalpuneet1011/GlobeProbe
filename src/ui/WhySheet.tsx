import React, { useEffect, useRef, useState } from 'react';
import { Linking, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BottomSheet } from './BottomSheet';
import { T } from './Text';
import { C } from './theme';
import { Chip } from './Chip';
import { SpeechBubble } from './SpeechBubble';
import { ChunkyButton, IconButton } from './ChunkyButton';
import { Waveform } from './Waveform';
import { useVoiceRecorder } from './useVoiceRecorder';
import { usePrefs } from './prefs';
import { speak } from './voice';
import { useApp } from '../state/app';
import * as Q from '../db/queries';
import type { Concept } from '../types';
import { askWhy, readAudio } from '../ai/gemini';
import { SYSTEM, WHY } from '../content/copy';
import { logError } from '../state/errorlog';

type Answer = { text: string; lab: boolean; question: string } | null;

/** S11. Preset questions (authored, instant), plus "Ask your own" by voice or keyboard (Gemini, falls back silently). */
export function WhySheet({ visible, onClose, concept }: { visible: boolean; onClose: () => void; concept: Concept }) {
  const router = useRouter();
  const { db, active } = useApp();
  const { ttsRate } = usePrefs();
  const [answer, setAnswer] = useState<Answer>(null);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [micNote, setMicNote] = useState('');
  const abort = useRef<AbortController | null>(null);
  const rec = useVoiceRecorder(20, (r) => { if (r) void sendAudio(r.uri, r.silent); });

  useEffect(() => { if (!visible) { abort.current?.abort(); setAnswer(null); setNote(''); setMicNote(''); setText(''); setTyping(false); } }, [visible]);

  const log = (question: string, a: string, inScope: boolean, source: 'faq' | 'ai' | 'offline') => {
    if (active) void Q.addWhy(db, active.id, { conceptId: concept.id, question, answer: a, inScope, source }).catch((e) => logError('addWhy', e));
  };
  const show = (a: Answer) => { setAnswer(a); if (a && active?.readAloud) void speak(a.text, ttsRate); };

  const preset = (i: number) => {
    const f = concept.faq[i];
    show({ text: f.a, lab: false, question: f.q });
    log(f.q, f.a, true, 'faq');
  };
  const offline = (question: string) => {
    setNote(SYSTEM.offlineWhy);
    log(question || '(question)', SYSTEM.offlineWhy, false, 'offline');
  };

  const send = async (question: string, audio?: { base64: string }) => {
    setBusy(true); setNote(''); setAnswer(null);
    abort.current?.abort();
    const ctl = new AbortController(); abort.current = ctl;
    const r = await askWhy(concept, active?.rank ?? 'Junior Detective', question, { signal: ctl.signal, audio: audio as never });
    setBusy(false);
    if (ctl.signal.aborted) return;
    if (r.ok) {
      const q = r.data.transcript || question;
      show({ text: r.data.answer, lab: r.data.suggestLab, question: q });
      log(q, r.data.answer, r.data.inScope, 'ai');
    } else offline(question);
  };
  const sendAudio = async (uri: string, silent: boolean) => {
    if (silent) { setNote(SYSTEM.heardNothing); return; }
    try { await send('(spoken, see audio)', await readAudio(uri)); } catch (e) { void logError('why-audio', e); offline('(spoken question)'); }
  };

  const toggleMic = async () => {
    if (rec.state === 'recording') { const r = await rec.stop(); if (r) await sendAudio(r.uri, r.silent); return; }
    setTyping(false); setMicNote(''); setNote('');
    const ok = await rec.start();
    if (!ok) setMicNote(rec.errorRef.current === 'blocked' ? SYSTEM.micBlocked : rec.errorRef.current === 'failed' ? SYSTEM.micFailed : SYSTEM.micDenied);
  };

  const presets = concept.faq.slice(0, 5);
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <T v="h1">{WHY.title}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {presets.map((f, i) => <Chip key={f.q} label={f.q} onPress={() => preset(i)} selected={answer?.question === f.q} />)}
      </View>

      {busy ? <SpeechBubble text="Let me think about that…" expression="thinking" binduSize={48} /> : null}
      {note ? <SpeechBubble text={note} expression="encouraging" binduSize={48} /> : null}
      {answer ? (
        <View style={{ gap: 10 }}>
          <T v="label" color={C.ink2}>{answer.question}</T>
          <SpeechBubble text={answer.text} expression="thinking" binduSize={48} showSpeaker onSpeak={() => speak(answer.text, ttsRate)} />
          {answer.lab ? <ChunkyButton small kind="secondary" label={WHY.tryLab} icon="lab" onPress={() => { onClose(); router.push(`/lab/${concept.sim}`); }} /> : null}
        </View>
      ) : null}

      <T v="h2">{WHY.askOwn}</T>
      {rec.state === 'recording' ? (
        <View style={{ gap: 8 }}>
          <Waveform level={rec.level} />
          <ChunkyButton kind="secondary" label="Done" icon="mic" onPress={toggleMic} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <IconButton icon="mic" label="Ask by voice" onPress={toggleMic} />
          <IconButton icon="keyboard" label="Ask by typing" onPress={() => setTyping((t) => !t)} />
        </View>
      )}
      {micNote ? (
        <View style={{ gap: 8 }}>
          <SpeechBubble text={micNote} expression="encouraging" binduSize={48} />
          {micNote === SYSTEM.micBlocked ? <ChunkyButton small kind="secondary" label="Open Settings" onPress={() => { void Linking.openSettings(); }} /> : null}
        </View>
      ) : null}
      {typing ? (
        <View style={{ gap: 10 }}>
          <TextInput
            value={text} onChangeText={(t) => setText(t.slice(0, WHY.max))} maxLength={WHY.max} multiline
            accessibilityLabel="Your question" placeholder={WHY.placeholder} placeholderTextColor={C.ink2}
            style={{ minHeight: 64, borderWidth: 2, borderColor: C.ink, borderRadius: 16, backgroundColor: C.paper, padding: 12, fontFamily: 'Nunito_600SemiBold', fontSize: 17, color: C.ink, textAlignVertical: 'top' }}
          />
          <T v="label" color={C.ink2}>{text.length} / {WHY.max}</T>
          <ChunkyButton label={WHY.ask} disabled={!text.trim() || busy} onPress={() => { const q = text.trim(); setTyping(false); setText(''); void send(q); }} />
        </View>
      ) : null}
    </BottomSheet>
  );
}
