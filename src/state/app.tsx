// App-wide state: database, profiles, the active profile and its progress, shared settings.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Db } from '../db/types';
import { openDb } from '../db/expo';
import * as Q from '../db/queries';
import type { ConceptId, ConceptProgress, ReviewState } from '../types';
import { PrefsProvider, type Prefs } from '../ui/prefs';
import { setSoundEnabled } from '../ui/sfx';
import { logError } from './errorlog';
import { istDayKey, nowIso } from '../util/time';

interface AppCtx {
  db: Db;
  profiles: Q.Profile[];
  active: Q.Profile | null;
  progress: ConceptProgress[];
  reviews: ReviewState[];
  solvedCases: string[];
  parentUnlocked: boolean;
  rankUp: string | null;
  showRankUp: (word: string | null) => void;
  unlockParent: () => void;
  lockParent: () => void;
  reloadProfiles: () => Promise<Q.Profile[]>;
  selectProfile: (id: string) => Promise<void>;
  leaveProfile: () => Promise<void>;
  refresh: () => Promise<void>;
  createProfile: (name: string, colour: string) => Promise<Q.Profile>;
  patchActive: (p: Parameters<typeof Q.updateProfile>[2]) => Promise<void>;
  levelOf: (id: ConceptId) => number;
  progressOf: (id: ConceptId) => ConceptProgress;
}

const Ctx = createContext<AppCtx | null>(null);
export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
}

export type BootState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' };

async function loadPrefs(db: Db): Promise<Prefs> {
  const [s, r, t, k] = await Promise.all([Q.getSetting(db, 'sound'), Q.getSetting(db, 'reduce_motion'), Q.getSetting(db, 'tts_rate'), Q.getSetting(db, 'keep_awake')]);
  const rate = Number(t);
  return { sound: s !== '0', reduceMotionSetting: r === '1', ttsRate: [0.85, 1, 1.15].includes(rate) ? rate : 1, keepAwake: k !== '0' };
}

export function AppProvider({ children, fallback }: { children: React.ReactNode; fallback: (s: BootState) => React.ReactNode }) {
  const [boot, setBoot] = useState<BootState>({ status: 'loading' });
  const [db, setDb] = useState<Db | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [profiles, setProfiles] = useState<Q.Profile[]>([]);
  const [active, setActive] = useState<Q.Profile | null>(null);
  const [progress, setProgress] = useState<ConceptProgress[]>([]);
  const [reviews, setReviews] = useState<ReviewState[]>([]);
  const [solvedCases, setSolved] = useState<string[]>([]);
  const [parentUnlocked, setParentUnlocked] = useState(false);
  const [rankUp, setRankUp] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  const activeRef = useRef<Q.Profile | null>(null);
  activeRef.current = active;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await openDb();
        const p = await loadPrefs(d);
        const list = await Q.listProfiles(d);
        setSoundEnabled(p.sound);
        if (!alive) return;
        setDb(d); setPrefs(p); setProfiles(list);
        setBoot({ status: 'ready' });
      } catch (e) {
        void logError('boot', e);
        if (alive) setBoot({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { alive = false; };
  }, []);

  const endSession = useCallback(async () => {
    const id = sessionRef.current;
    sessionRef.current = null;
    if (id && db) { try { await Q.endSession(db, id); } catch (e) { void logError('endSession', e); } }
  }, [db]);

  const beginSession = useCallback(async (profileId: string) => {
    if (!db || sessionRef.current) return;
    try { sessionRef.current = await Q.startSession(db, profileId); } catch (e) { void logError('startSession', e); }
  }, [db]);

  // Time spent counts only while the app is in the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') { if (activeRef.current) void beginSession(activeRef.current.id); }
      else void endSession();
    });
    return () => sub.remove();
  }, [beginSession, endSession]);

  const refresh = useCallback(async () => {
    if (!db || !activeRef.current) return;
    const id = activeRef.current.id;
    const [pr, rv, sc, prof] = await Promise.all([Q.getProgress(db, id), Q.getReviews(db, id), Q.solvedCaseIds(db, id), Q.getProfile(db, id)]);
    setProgress(pr); setReviews(rv); setSolved(sc);
    if (prof) setActive(prof);
  }, [db]);

  const reloadProfiles = useCallback(async () => {
    if (!db) return [];
    const list = await Q.listProfiles(db);
    setProfiles(list);
    return list;
  }, [db]);

  const selectProfile = useCallback(async (id: string) => {
    if (!db) return;
    await endSession();
    await Q.ensureProgressRows(db, id);
    const prof = await Q.getProfile(db, id);
    if (!prof) return;
    activeRef.current = prof;
    setActive(prof);
    const [pr, rv, sc] = await Promise.all([Q.getProgress(db, id), Q.getReviews(db, id), Q.solvedCaseIds(db, id)]);
    setProgress(pr); setReviews(rv); setSolved(sc);
    try { const gone = await Q.purgeOldAudio(db, id, nowIso()); await deleteFiles(gone); } catch (e) { void logError('purgeAudio', e); }
    await beginSession(id);
  }, [db, beginSession, endSession]);

  const leaveProfile = useCallback(async () => {
    await endSession();
    activeRef.current = null;
    setActive(null); setProgress([]); setReviews([]); setSolved([]);
  }, [endSession]);

  const createProfile = useCallback(async (name: string, colour: string) => {
    if (!db) throw new Error('Database not ready');
    const p = await Q.createProfile(db, name, colour);
    await reloadProfiles();
    return p;
  }, [db, reloadProfiles]);

  const patchActive = useCallback(async (patch: Parameters<typeof Q.updateProfile>[2]) => {
    if (!db || !activeRef.current) return;
    await Q.updateProfile(db, activeRef.current.id, patch);
    await refresh();
  }, [db, refresh]);

  const onPrefs = useCallback((p: Prefs) => {
    if (!db) return;
    setSoundEnabled(p.sound);
    void Q.setSetting(db, 'sound', p.sound ? '1' : '0');
    void Q.setSetting(db, 'reduce_motion', p.reduceMotionSetting ? '1' : '0');
    void Q.setSetting(db, 'tts_rate', String(p.ttsRate));
    void Q.setSetting(db, 'keep_awake', p.keepAwake ? '1' : '0');
  }, [db]);

  const value = useMemo<AppCtx | null>(() => db ? ({
    db, profiles, active, progress, reviews, solvedCases, parentUnlocked, rankUp, showRankUp: setRankUp,
    unlockParent: () => setParentUnlocked(true), lockParent: () => setParentUnlocked(false),
    reloadProfiles, selectProfile, leaveProfile, refresh, createProfile, patchActive,
    levelOf: (id) => progress.find((p) => p.conceptId === id)?.level ?? 0,
    progressOf: (id) => progress.find((p) => p.conceptId === id)!,
  }) : null, [db, profiles, active, progress, reviews, solvedCases, parentUnlocked, rankUp, reloadProfiles, selectProfile, leaveProfile, refresh, createProfile, patchActive]);

  if (boot.status === 'error') return <>{fallback(boot)}</>;
  if (!value || !prefs) return <>{fallback(boot)}</>;
  return (
    <Ctx.Provider value={value}>
      <PrefsProvider initial={prefs} onChange={onPrefs}>{children}</PrefsProvider>
    </Ctx.Provider>
  );
}

export async function deleteFiles(paths: string[]) {
  if (!paths.length) return;
  const FileSystem = await import('expo-file-system/legacy');
  for (const p of paths) { try { await FileSystem.deleteAsync(p, { idempotent: true }); } catch { /* already gone */ } }
}

export const todayKey = () => istDayKey(nowIso());
