import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { Screen } from '../src/ui/Screen';
import { T } from '../src/ui/Text';
import { Card } from '../src/ui/Card';
import { Chip } from '../src/ui/Chip';
import { ChunkyButton, IconButton, TextLink } from '../src/ui/ChunkyButton';
import { Segmented } from '../src/ui/Segmented';
import { ToggleRow } from '../src/ui/Toggle';
import { BottomSheet } from '../src/ui/BottomSheet';
import { PinPad } from '../src/ui/PinPad';
import { KeyField } from '../src/ui/KeyField';
import { getModel, setModel } from '../src/ai/gemini';
import { GEMINI_MODELS, MODEL_LABELS, type GeminiModel } from '../src/ai/config';
import { useToast } from '../src/ui/Toast';
import { usePrefs } from '../src/ui/prefs';
import { useHardwareBack } from '../src/ui/hooks';
import { C } from '../src/ui/theme';
import { deleteFiles, useApp } from '../src/state/app';
import * as Q from '../src/db/queries';
import { CONCEPTS, getCase, maybeConcept } from '../src/content';
import { LEVEL_LABEL, PARENT } from '../src/content/copy';
import type { ConceptId } from '../src/types';
import { setPin } from '../src/state/pin';
import { exportAndShare } from '../src/state/exportZip';
import { clearErrorLog, logError, readErrorLog } from '../src/state/errorlog';
import { fmtDateShort } from '../src/util/time';
import { nowIso } from '../src/util/time';
import { stopSpeaking } from '../src/ui/voice';

const VERSION = '1.0.0';
const VERDICT_LABEL: Record<string, string> = { solved: 'Solved', partly: 'Nearly there', retry: 'Try again later' };

function H({ children }: { children: string }) {
  return <T v="h1" style={{ marginTop: 8 }}>{children}</T>;
}

type Confirm = null | { kind: 'reset' | 'delete' };

/** S12. Parent Zone. Reached only through the lock gate on the profile screen; leaving it re-locks. */
export default function ParentZone() {
  const app = useApp();
  const router = useRouter();
  const toast = useToast();
  const prefs = usePrefs();
  const { db } = app;

  const [profileId, setProfileId] = useState<string | null>(app.profiles[0]?.id ?? null);
  const profile = app.profiles.find((p) => p.id === profileId) ?? null;

  const [accuracy, setAccuracy] = useState<Record<string, { firstTry: number; correct: number } | null>>({});
  const [progress, setProgress] = useState<Awaited<ReturnType<typeof Q.getProgress>>>([]);
  const [miscs, setMiscs] = useState<Q.MisconceptionRow[]>([]);
  const [cases, setCases] = useState<Q.CaseRow[]>([]);
  const [why, setWhy] = useState<Q.WhyRow[]>([]);
  const [minutes, setMinutes] = useState<{ day: string; minutes: number }[]>([]);
  const [openCase, setOpenCase] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [model, setModelState] = useState<GeminiModel>(GEMINI_MODELS[0]);
  useEffect(() => { void getModel().then(setModelState); }, []);

  const [pinSheet, setPinSheet] = useState(false);
  const [pinFirst, setPinFirst] = useState<string | null>(null);
  const [pinMsg, setPinMsg] = useState('');
  const [pinKey, setPinKey] = useState(0);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [typed, setTyped] = useState('');
  const [logOpen, setLogOpen] = useState(false);
  const [logText, setLogText] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const player = useRef<AudioPlayer | null>(null);

  const leave = useCallback(() => {
    stopSpeaking();
    try { player.current?.pause(); player.current?.remove(); } catch { /* ignore */ }
    app.lockParent();
    router.replace('/profiles');
  }, [app, router]);
  useHardwareBack(() => {
    if (pinSheet) { setPinSheet(false); return true; }
    if (confirm) { setConfirm(null); return true; }
    if (logOpen) { setLogOpen(false); return true; }
    if (syncOpen) { setSyncOpen(false); return true; }
    leave();
    return true;
  });
  useEffect(() => () => { app.lockParent(); try { player.current?.remove(); } catch { /* ignore */ } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!app.parentUnlocked) router.replace('/profiles'); }, [app.parentUnlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (!profileId) { setProgress([]); setMiscs([]); setCases([]); setWhy([]); setMinutes([]); return; }
    try {
      const [pr, ms, cs, wl, mn] = await Promise.all([
        Q.getProgress(db, profileId), Q.listMisconceptions(db, profileId), Q.listCaseAttempts(db, profileId), Q.listWhy(db, profileId), Q.minutesPerDay(db, profileId, nowIso(), 14),
      ]);
      const acc: Record<string, { firstTry: number; correct: number } | null> = {};
      for (const c of CONCEPTS) acc[c.id] = await Q.explainAccuracy(db, profileId, c.id);
      setProgress(pr); setMiscs(ms); setCases(cs); setWhy(wl); setMinutes(mn); setAccuracy(acc);
    } catch (e) { void logError('parent-load', e); }
  }, [db, profileId]);
  useEffect(() => { void load(); }, [load]);

  const miscDef = (id: string) => {
    for (const c of CONCEPTS) { const m = c.explain.misconceptions.find((x) => x.id === id); if (m) return { label: m.parentLabel, concept: c.title }; }
    return { label: id, concept: '' };
  };

  const playAudio = (path: string) => {
    try {
      stopSpeaking();
      player.current?.remove();
      player.current = createAudioPlayer({ uri: path });
      player.current.play();
    } catch (e) { void logError('parent-play', e); toast('Could not play that recording.'); }
  };

  const savePin = async (pin: string) => {
    if (pinFirst === null) { setPinFirst(pin); setPinMsg('Enter it once more to confirm.'); setPinKey((k) => k + 1); return; }
    if (pin !== pinFirst) { setPinFirst(null); setPinMsg('Those did not match. Start again.'); setPinKey((k) => k + 1); return; }
    try { await setPin(pin); setPinSheet(false); toast('PIN changed'); } catch (e) { void logError('parent-pin', e); setPinMsg('Could not save the PIN.'); }
  };

  const doExport = async () => {
    if (!profile || busy) return;
    setBusy(true);
    try {
      const data = await Q.exportProfile(db, profile.id);
      const photos: string[] = [];
      for (const t of ['missions', 'sky_log'] as const) for (const r of (data[t] as { photo_path?: string | null }[]) ?? []) if (r.photo_path) photos.push(r.photo_path);
      const r = await exportAndShare(profile.name, data, photos);
      if (!r.ok) toast(r.message ?? 'Could not share.');
    } catch (e) { void logError('parent-export', e); toast('Export did not work. Try again.'); }
    setBusy(false);
  };

  const doClearRecordings = async () => {
    if (!profile) return;
    const gone = await Q.clearRecordings(db, profile.id);
    await deleteFiles(gone);
    await load();
    toast('Recordings deleted');
  };

  const doConfirm = async () => {
    if (!profile || !confirm) return;
    setBusy(true);
    try {
      const files = confirm.kind === 'reset' ? await Q.resetProfile(db, profile.id) : await Q.deleteProfile(db, profile.id);
      await deleteFiles(files);
      const list = await app.reloadProfiles();
      setConfirm(null); setTyped('');
      if (confirm.kind === 'delete') setProfileId(list[0]?.id ?? null);
      else await load();
      toast(confirm.kind === 'reset' ? 'Profile reset' : 'Profile deleted');
    } catch (e) { void logError('parent-wipe', e); toast('That did not work. Try again.'); }
    setBusy(false);
  };

  const openLog = async () => { setLogText(await readErrorLog()); setLogOpen(true); };

  const maxMin = Math.max(10, ...minutes.map((m) => m.minutes));
  const totalMin = minutes.reduce((a, m) => a + m.minutes, 0);
  const syncConcept = profile?.schoolSyncConcept ? maybeConcept(profile.schoolSyncConcept) : undefined;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton icon="back" label="Back to profiles" onPress={leave} />
        <T v="h1" style={{ flex: 1 }}>{PARENT.title}</T>
      </View>

      {app.profiles.length === 0 ? (
        <Card><T v="body">No profiles yet. Add one from the Who's exploring screen.</T></Card>
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {app.profiles.map((p) => <Chip key={p.id} label={p.name} selected={p.id === profileId} onPress={() => setProfileId(p.id)} />)}
          </View>

          <H>Concepts</H>
          <Card>
            {CONCEPTS.map((c, i) => {
              const pr = progress.find((p) => p.conceptId === c.id);
              const acc = accuracy[c.id];
              return (
                <View key={c.id} style={{ minHeight: 56, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderColor: C.todo, gap: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <T v="choice" style={{ flex: 1 }}>{c.title}</T>
                    <T v="choice" color={C.ink2}>{LEVEL_LABEL[pr?.level ?? 0] || 'Not started'}</T>
                  </View>
                  <T v="label" color={C.ink2}>
                    {pr?.lastSeenAt ? `Last seen ${fmtDateShort(pr.lastSeenAt)}` : 'Not seen yet'}
                    {acc ? `  ·  Explain right first time: ${acc.correct} of ${acc.firstTry}` : ''}
                  </T>
                </View>
              );
            })}
          </Card>

          <H>Ideas to watch</H>
          <Card>
            {miscs.length === 0 ? <T v="body" color={C.ink2}>Nothing to flag yet.</T> : miscs.map((m, i) => {
              const d = miscDef(m.id);
              return (
                <View key={m.id} style={{ minHeight: 56, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderColor: C.todo, gap: 2 }}>
                  <T v="choice">{d.label}</T>
                  <T v="label" color={C.ink2}>{d.concept ? `${d.concept}  ·  ` : ''}{m.times} {m.times === 1 ? 'time' : 'times'}{m.cleared ? '  ·  cleared' : ''}{m.lastAt ? `  ·  ${fmtDateShort(m.lastAt)}` : ''}</T>
                </View>
              );
            })}
          </Card>

          <H>Case Files</H>
          {cases.length === 0 ? <Card><T v="body" color={C.ink2}>No case answers yet.</T></Card> : cases.map((c) => {
            const open = openCase === c.id;
            let title = c.caseId;
            try { title = getCase(c.caseId).title; } catch { /* unknown id */ }
            return (
              <Card key={c.id} onPress={() => setOpenCase(open ? null : c.id)} accessibilityLabel={`${title}, ${VERDICT_LABEL[c.verdict] ?? c.verdict}`}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <T v="choice" style={{ flex: 1 }}>{title}</T>
                  <T v="label" color={C.ink2}>{VERDICT_LABEL[c.verdict] ?? c.verdict}  ·  {fmtDateShort(c.createdAt)}</T>
                </View>
                {open ? (
                  <View style={{ gap: 8, marginTop: 8 }}>
                    <T v="label" color={C.ink2}>{c.answerMode === 'speak' ? 'Spoken answer' : c.answerMode === 'type' ? 'Typed answer' : 'Built answer'}</T>
                    {c.transcript ? <T v="body">{c.transcript}</T> : null}
                    {c.parentNote ? <T v="body" color={C.ink2}>{c.parentNote}</T> : null}
                    {c.audioPath ? <ChunkyButton small kind="secondary" icon="speaker" label="Play recording" onPress={() => playAudio(c.audioPath!)} /> : null}
                  </View>
                ) : null}
              </Card>
            );
          })}

          <H>Why? questions</H>
          <Card>
            {why.length === 0 ? <T v="body" color={C.ink2}>No questions asked yet.</T> : why.slice(0, 30).map((w, i) => (
              <View key={w.id} style={{ paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderColor: C.todo, gap: 2, backgroundColor: w.source === 'ai' && !w.inScope ? '#FFF1D6' : undefined }}>
                <T v="choice">{w.question}</T>
                <T v="label" color={C.ink2}>{maybeConcept(w.conceptId)?.title ?? w.conceptId}  ·  {fmtDateShort(w.createdAt)}{w.source === 'ai' && !w.inScope ? '  ·  outside this topic' : w.source === 'offline' ? '  ·  no answer (offline)' : ''}</T>
                <T v="label" color={C.ink2}>{w.answer}</T>
              </View>
            ))}
          </Card>

          <H>Time</H>
          <Card>
            <T v="label" color={C.ink2}>Minutes per day, last 14 days. Total {Math.round(totalMin)}.</T>
            <View accessible accessibilityLabel={`Minutes per day for 14 days, total ${Math.round(totalMin)}`} style={{ flexDirection: 'row', alignItems: 'flex-end', height: 96, gap: 4, marginTop: 8 }}>
              {minutes.map((m) => (
                <View key={m.day} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 96 }}>
                  <View style={{ width: '100%', height: Math.max(m.minutes > 0 ? 4 : 1, (m.minutes / maxMin) * 84), backgroundColor: m.minutes > 0 ? C.sea : C.todo, borderRadius: 4 }} />
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <T v="label" color={C.ink2}>{minutes[0] ? fmtDateShort(minutes[0].day) : ''}</T>
              <T v="label" color={C.ink2}>Today</T>
            </View>
          </Card>

          <H>School sync</H>
          <Card>
            <T v="body" color={C.ink2}>Pick the concept the class is on. It shows first on the Journey.</T>
            <ChunkyButton small kind="ghost" label={syncConcept ? syncConcept.title : 'None'} onPress={() => setSyncOpen(true)} style={{ marginTop: 8 }} />
          </Card>
        </>
      )}

      <H>Settings</H>
      <Card>
        <T v="choice">Gemini API key</T>
        <T v="label" color={C.ink2}>{hasKey === false ? PARENT.noKeyBanner : 'Used for spoken answers and Why? questions.'}</T>
        <View style={{ marginTop: 8 }}><KeyField onChange={setHasKey} /></View>
      </Card>
      <Card>
        <T v="choice">AI model</T>
        <T v="label" color={C.ink2}>If the chosen model stops answering, the app tries the next one on its own and keeps the one that works.</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
          {GEMINI_MODELS.map((m) => <Chip key={m} label={MODEL_LABELS[m]} selected={m === model} onPress={() => { setModelState(m); void setModel(m); }} />)}
        </View>
      </Card>
      <Card>
        <Segmented label="Read-aloud speed" value={String(prefs.ttsRate)} options={[{ id: '0.85', label: 'Slow' }, { id: '1', label: 'Normal' }, { id: '1.15', label: 'Quick' }]} onChange={(v) => prefs.set({ ttsRate: Number(v) })} />
        <ToggleRow label="Reduce motion" value={prefs.reduceMotionSetting} onChange={(v) => prefs.set({ reduceMotionSetting: v })} />
        <ToggleRow label="Sound" value={prefs.sound} onChange={(v) => prefs.set({ sound: v })} />
        <ToggleRow label="Keep screen on" hint="Screen stays awake while the app is open. It always stays on while waiting for an AI answer." value={prefs.keepAwake} onChange={(v) => prefs.set({ keepAwake: v })} />
        <ChunkyButton small kind="ghost" label="Change PIN" onPress={() => { setPinFirst(null); setPinMsg('Enter a new 4-digit PIN.'); setPinKey((k) => k + 1); setPinSheet(true); }} style={{ marginTop: 8 }} />
      </Card>

      {profile ? (
        <>
          <H>Data</H>
          <Card>
            <T v="label" color={C.ink2}>For {profile.name}. Everything stays on this phone unless you export it.</T>
            <View style={{ gap: 10, marginTop: 8 }}>
              <ChunkyButton small kind="secondary" label={busy ? 'Working...' : 'Export progress'} disabled={busy} onPress={doExport} />
              <ChunkyButton small kind="ghost" label="Delete recordings" onPress={doClearRecordings} />
              <ChunkyButton small kind="ghost" label="Reset profile" onPress={() => { setTyped(''); setConfirm({ kind: 'reset' }); }} />
              <ChunkyButton small kind="ghost" label="Delete profile" onPress={() => { setTyped(''); setConfirm({ kind: 'delete' }); }} />
            </View>
          </Card>
        </>
      ) : null}

      <H>About</H>
      <Card>
        <T v="body">GlobeProbe {VERSION}</T>
        <T v="label" color={C.ink2}>
          Weather and tide data: Open-Meteo.com (CC BY 4.0). Land shapes: Natural Earth (public domain). Photos: see the credit on each photo. Voice answers use Google Gemini with your key.
        </T>
        <T v="label" color={C.ink2} style={{ marginTop: 8 }}>
          Privacy: no accounts, no ads, no tracking. Progress, photos and recordings stay on this phone. The phone sends weather and tide requests (no names, no location) and, only when you add a key, a child's question or spoken answer to Gemini. Recordings older than 30 days are deleted automatically.
        </T>
        <View style={{ marginTop: 8 }}><TextLink label="Error log" icon="settings" onPress={openLog} /></View>
      </Card>

      <ChunkyButton label="Back to profiles" onPress={leave} />

      <BottomSheet visible={syncOpen} onClose={() => setSyncOpen(false)}>
        <T v="h1">School sync</T>
        <View style={{ gap: 10, marginTop: 8 }}>
          <Chip label="None" selected={!profile?.schoolSyncConcept} onPress={async () => { if (profile) { await Q.updateProfile(db, profile.id, { schoolSyncConcept: null }); await app.reloadProfiles(); } setSyncOpen(false); }} />
          {CONCEPTS.map((c) => (
            <Chip key={c.id} label={c.title} selected={profile?.schoolSyncConcept === c.id}
              onPress={async () => { if (profile) { await Q.updateProfile(db, profile.id, { schoolSyncConcept: c.id as ConceptId }); await app.reloadProfiles(); } setSyncOpen(false); }} />
          ))}
        </View>
      </BottomSheet>

      <BottomSheet visible={pinSheet} onClose={() => setPinSheet(false)}>
        <View style={{ alignItems: 'center', gap: 16, paddingVertical: 8 }}>
          <T v="h1" center>Change PIN</T>
          <T v="body" center color={C.ink2}>{pinMsg}</T>
          <PinPad onComplete={savePin} resetKey={pinKey} />
        </View>
      </BottomSheet>

      <BottomSheet visible={!!confirm} onClose={() => setConfirm(null)}>
        <View style={{ gap: 12, paddingVertical: 8 }}>
          <T v="h1">{confirm?.kind === 'delete' ? 'Delete this profile?' : 'Reset this profile?'}</T>
          <T v="body">
            {confirm?.kind === 'delete'
              ? 'This removes the profile, its progress, photos and recordings. It cannot be undone.'
              : 'This clears all progress, photos and recordings and starts again from Explorer. The profile stays.'}
          </T>
          <T v="label" color={C.ink2}>Type the name "{profile?.name}" to confirm.</T>
          <TextInput value={typed} onChangeText={setTyped} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Type the profile name"
            style={{ minHeight: 56, borderWidth: 2, borderColor: C.ink, borderRadius: 16, paddingHorizontal: 14, fontSize: 18, backgroundColor: C.paper, color: C.ink }} />
          <ChunkyButton label={confirm?.kind === 'delete' ? 'Delete profile' : 'Reset profile'} disabled={busy || typed.trim().toLowerCase() !== (profile?.name ?? '\u0000').toLowerCase()} onPress={doConfirm} />
          <ChunkyButton kind="ghost" label="Cancel" onPress={() => setConfirm(null)} />
        </View>
      </BottomSheet>

      <BottomSheet visible={logOpen} onClose={() => setLogOpen(false)}>
        <View style={{ gap: 12, paddingVertical: 8 }}>
          <T v="h1">Error log</T>
          <T v="label" color={C.ink2} selectable>{logText || 'Nothing logged.'}</T>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><ChunkyButton small kind="secondary" label="Copy" onPress={async () => { await Clipboard.setStringAsync(logText); toast('Copied'); }} /></View>
            <View style={{ flex: 1 }}><ChunkyButton small kind="ghost" label="Clear" onPress={async () => { await clearErrorLog(); setLogText(''); }} /></View>
          </View>
        </View>
      </BottomSheet>
    </Screen>
  );
}
