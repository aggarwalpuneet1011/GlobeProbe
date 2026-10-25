// All reads and writes. Every function takes the Db so tests can run them on node:sqlite.
import type { Db } from './types';
import type { ConceptId, ConceptProgress, ExampleKind, Level, ReviewState, AttemptKind } from '../types';
import { newProgress } from '../learning/mastery';
import { istDayKey, nowIso } from '../util/time';
import { RANKS } from '../content/copy';

const CONCEPT_IDS: ConceptId[] = ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08'];
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

// ---------------------------------------------------------------- profiles
export interface Profile {
  id: string; name: string; colour: string; createdAt: string; rank: string; readAloud: boolean;
  schoolSyncConcept: ConceptId | null; totalMinutes: number; onboarded: boolean;
}
interface ProfileRow { id: string; name: string; colour: string; created_at: string; rank: string; read_aloud: number; school_sync_concept: string | null; total_minutes: number; onboarded: number }
const toProfile = (r: ProfileRow): Profile => ({
  id: r.id, name: r.name, colour: r.colour, createdAt: r.created_at, rank: r.rank, readAloud: r.read_aloud === 1,
  schoolSyncConcept: (r.school_sync_concept as ConceptId | null) ?? null, totalMinutes: r.total_minutes, onboarded: r.onboarded === 1,
});
export const MAX_PROFILES = 4;
export const MAX_NAME = 12;
export const BINDU_COLOURS = ['blue', 'teal', 'purple', 'coral'] as const;
export type BinduColour = (typeof BINDU_COLOURS)[number];

export async function listProfiles(db: Db): Promise<Profile[]> {
  return (await db.all<ProfileRow>('SELECT * FROM profiles ORDER BY created_at, id')).map(toProfile);
}
export async function getProfile(db: Db, id: string): Promise<Profile | null> {
  const r = await db.first<ProfileRow>('SELECT * FROM profiles WHERE id = ?', [id]);
  return r ? toProfile(r) : null;
}
export async function createProfile(db: Db, name: string, colour: string): Promise<Profile> {
  const clean = name.trim().slice(0, MAX_NAME);
  if (!clean) throw new Error('Name needed');
  const count = (await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM profiles'))!.n;
  if (count >= MAX_PROFILES) throw new Error('Max profiles reached');
  const id = newId();
  await db.run('INSERT INTO profiles (id, name, colour, created_at, rank) VALUES (?,?,?,?,?)', [id, clean, colour, nowIso(), RANKS[0]]);
  await ensureProgressRows(db, id);
  return (await getProfile(db, id))!;
}
export async function updateProfile(db: Db, id: string, patch: Partial<Pick<Profile, 'name' | 'colour' | 'rank' | 'readAloud' | 'schoolSyncConcept' | 'onboarded'>>): Promise<void> {
  const sets: string[] = []; const vals: (string | number | null)[] = [];
  if (patch.name !== undefined) { sets.push('name = ?'); vals.push(patch.name.trim().slice(0, MAX_NAME)); }
  if (patch.colour !== undefined) { sets.push('colour = ?'); vals.push(patch.colour); }
  if (patch.rank !== undefined) { sets.push('rank = ?'); vals.push(patch.rank); }
  if (patch.readAloud !== undefined) { sets.push('read_aloud = ?'); vals.push(patch.readAloud ? 1 : 0); }
  if (patch.schoolSyncConcept !== undefined) { sets.push('school_sync_concept = ?'); vals.push(patch.schoolSyncConcept); }
  if (patch.onboarded !== undefined) { sets.push('onboarded = ?'); vals.push(patch.onboarded ? 1 : 0); }
  if (!sets.length) return;
  await db.run(`UPDATE profiles SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]);
}

const PROFILE_TABLES = ['concept_progress', 'reviews', 'attempts', 'misconceptions', 'cases', 'missions', 'sky_log', 'places_found', 'lab_solved', 'why_log', 'sessions'];

/** Returns the file paths (photos, audio) the caller should delete from disk. */
export async function wipeProfileData(db: Db, id: string): Promise<string[]> {
  const files: string[] = [];
  for (const r of await db.all<{ p: string | null }>('SELECT photo_path AS p FROM missions WHERE profile_id = ? UNION ALL SELECT photo_path FROM sky_log WHERE profile_id = ? UNION ALL SELECT audio_path FROM cases WHERE profile_id = ?', [id, id, id])) if (r.p) files.push(r.p);
  await db.tx(async () => { for (const t of PROFILE_TABLES) await db.run(`DELETE FROM ${t} WHERE profile_id = ?`, [id]); });
  return files;
}
export async function resetProfile(db: Db, id: string): Promise<string[]> {
  const files = await wipeProfileData(db, id);
  await db.run("UPDATE profiles SET rank = ?, total_minutes = 0, school_sync_concept = NULL WHERE id = ?", [RANKS[0], id]);
  await ensureProgressRows(db, id);
  return files;
}
export async function deleteProfile(db: Db, id: string): Promise<string[]> {
  const files = await wipeProfileData(db, id);
  await db.run('DELETE FROM profiles WHERE id = ?', [id]);
  return files;
}

// ---------------------------------------------------------------- progress
interface ProgressRow {
  profile_id: string; concept_id: string; level: number; stop_step: number; explain_correct_count: number; last_explain_example: string | null;
  last_explain_at: string | null; twist_passed: number; know_it_last_try: string | null; last_seen_at: string | null; started_at: string | null; finished_at: string | null;
}
const toProgress = (r: ProgressRow): ConceptProgress => ({
  conceptId: r.concept_id as ConceptId, level: r.level as Level, stopStep: r.stop_step, explainCorrectCount: r.explain_correct_count,
  lastExplainExample: r.last_explain_example as ExampleKind | null, lastExplainAt: r.last_explain_at, twistPassed: r.twist_passed === 1,
  knowItLastTry: r.know_it_last_try, lastSeenAt: r.last_seen_at, startedAt: r.started_at, finishedAt: r.finished_at,
});
export async function ensureProgressRows(db: Db, profileId: string): Promise<void> {
  for (const c of CONCEPT_IDS) await db.run('INSERT OR IGNORE INTO concept_progress (profile_id, concept_id) VALUES (?,?)', [profileId, c]);
}
export async function getProgress(db: Db, profileId: string): Promise<ConceptProgress[]> {
  await ensureProgressRows(db, profileId);
  return (await db.all<ProgressRow>('SELECT * FROM concept_progress WHERE profile_id = ? ORDER BY concept_id', [profileId])).map(toProgress);
}
export async function saveProgress(db: Db, profileId: string, p: ConceptProgress): Promise<void> {
  await db.run(
    `INSERT INTO concept_progress (profile_id, concept_id, level, stop_step, explain_correct_count, last_explain_example, last_explain_at, twist_passed, know_it_last_try, last_seen_at, started_at, finished_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(profile_id, concept_id) DO UPDATE SET level=excluded.level, stop_step=excluded.stop_step, explain_correct_count=excluded.explain_correct_count,
       last_explain_example=excluded.last_explain_example, last_explain_at=excluded.last_explain_at, twist_passed=excluded.twist_passed,
       know_it_last_try=excluded.know_it_last_try, last_seen_at=excluded.last_seen_at, started_at=excluded.started_at, finished_at=excluded.finished_at`,
    [profileId, p.conceptId, p.level, p.stopStep, p.explainCorrectCount, p.lastExplainExample, p.lastExplainAt, p.twistPassed ? 1 : 0, p.knowItLastTry, p.lastSeenAt, p.startedAt, p.finishedAt],
  );
}
export const blankProgress = (id: ConceptId) => newProgress(id);

// ---------------------------------------------------------------- reviews
export async function getReviews(db: Db, profileId: string): Promise<ReviewState[]> {
  return (await db.all<{ concept_id: string; due_at: string; interval_days: number }>('SELECT * FROM reviews WHERE profile_id = ?', [profileId]))
    .map((r) => ({ conceptId: r.concept_id as ConceptId, dueAt: r.due_at, intervalDays: r.interval_days }));
}
export async function saveReview(db: Db, profileId: string, r: ReviewState): Promise<void> {
  await db.run(
    'INSERT INTO reviews (profile_id, concept_id, due_at, interval_days) VALUES (?,?,?,?) ON CONFLICT(profile_id, concept_id) DO UPDATE SET due_at=excluded.due_at, interval_days=excluded.interval_days',
    [profileId, r.conceptId, r.dueAt, r.intervalDays],
  );
}

// ---------------------------------------------------------------- attempts and misconceptions
export interface AttemptInput {
  conceptId: ConceptId; kind: AttemptKind; itemId: string; choiceId: string; correct: boolean; firstTry: boolean; withHelp?: boolean; misconceptionId?: string | null; at?: string;
}
export async function addAttempt(db: Db, profileId: string, a: AttemptInput): Promise<void> {
  const at = a.at ?? nowIso();
  await db.run(
    'INSERT INTO attempts (id, profile_id, concept_id, kind, item_id, choice_id, correct, first_try, with_help, misconception_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [newId(), profileId, a.conceptId, a.kind, a.itemId, a.choiceId, a.correct ? 1 : 0, a.firstTry ? 1 : 0, a.withHelp ? 1 : 0, a.misconceptionId ?? null, at],
  );
  if (a.misconceptionId) {
    await db.run(
      `INSERT INTO misconceptions (profile_id, misconception_id, times, cleared, correct_since, last_at) VALUES (?,?,1,0,0,?)
       ON CONFLICT(profile_id, misconception_id) DO UPDATE SET times = times + 1, cleared = 0, correct_since = 0, last_at = excluded.last_at`,
      [profileId, a.misconceptionId, at],
    );
  }
}
/** Misconceptions spotted outside Explain (Case Big Why scoring). Same bookkeeping as an Explain miss. */
export async function noteMisconceptions(db: Db, profileId: string, ids: string[], at = nowIso()): Promise<void> {
  for (const id of ids) {
    await db.run(
      `INSERT INTO misconceptions (profile_id, misconception_id, times, cleared, correct_since, last_at) VALUES (?,?,1,0,0,?)
       ON CONFLICT(profile_id, misconception_id) DO UPDATE SET times = times + 1, cleared = 0, correct_since = 0, last_at = excluded.last_at`,
      [profileId, id, at],
    );
  }
}
/** A misconception is "cleared" after two later first-try correct Explain answers on the same concept. */
export async function noteCorrectExplain(db: Db, profileId: string, misconceptionIds: string[]): Promise<void> {
  for (const m of misconceptionIds) {
    await db.run('UPDATE misconceptions SET correct_since = correct_since + 1 WHERE profile_id = ? AND misconception_id = ? AND cleared = 0 AND times > 0', [profileId, m]);
    await db.run('UPDATE misconceptions SET cleared = 1 WHERE profile_id = ? AND misconception_id = ? AND correct_since >= 2', [profileId, m]);
  }
}
export interface MisconceptionRow { id: string; times: number; cleared: boolean; lastAt: string | null }
export async function listMisconceptions(db: Db, profileId: string): Promise<MisconceptionRow[]> {
  return (await db.all<{ misconception_id: string; times: number; cleared: number; last_at: string | null }>('SELECT * FROM misconceptions WHERE profile_id = ? AND times > 0 ORDER BY last_at DESC', [profileId]))
    .map((r) => ({ id: r.misconception_id, times: r.times, cleared: r.cleared === 1, lastAt: r.last_at }));
}
/** Latest-first results for a concept's naming items (Stop step 5 and Duel items), used for the "2 in a row" rule. */
export async function recentNameResults(db: Db, profileId: string, conceptId: ConceptId, limit = 6): Promise<boolean[]> {
  const rows = await db.all<{ correct: number }>(
    "SELECT correct FROM attempts WHERE profile_id = ? AND concept_id = ? AND kind IN ('name','duel') AND first_try = 1 ORDER BY created_at DESC, rowid DESC LIMIT ?",
    [profileId, conceptId, limit],
  );
  return rows.map((r) => r.correct === 1).reverse();
}
export async function explainAccuracy(db: Db, profileId: string, conceptId: ConceptId): Promise<{ firstTry: number; correct: number } | null> {
  const r = await db.first<{ n: number; c: number }>("SELECT COUNT(*) AS n, COALESCE(SUM(correct),0) AS c FROM attempts WHERE profile_id = ? AND concept_id = ? AND kind IN ('explain','review') AND first_try = 1 AND with_help = 0", [profileId, conceptId]);
  return r && r.n > 0 ? { firstTry: r.n, correct: r.c } : null;
}

// ---------------------------------------------------------------- cases
export interface CaseRow {
  id: string; caseId: string; verdict: string; answerMode: string; transcript: string | null; ideasFound: string[]; misconceptionsFound: string[];
  childFeedback: string | null; parentNote: string | null; audioPath: string | null; createdAt: string;
}
interface CaseDb { id: string; case_id: string; verdict: string; answer_mode: string; transcript: string | null; ideas_found: string | null; misconceptions_found: string | null; child_feedback: string | null; parent_note: string | null; audio_path: string | null; created_at: string }
const toCase = (r: CaseDb): CaseRow => ({
  id: r.id, caseId: r.case_id, verdict: r.verdict, answerMode: r.answer_mode, transcript: r.transcript, ideasFound: JSON.parse(r.ideas_found ?? '[]'),
  misconceptionsFound: JSON.parse(r.misconceptions_found ?? '[]'), childFeedback: r.child_feedback, parentNote: r.parent_note, audioPath: r.audio_path, createdAt: r.created_at,
});
export async function saveCaseAttempt(db: Db, profileId: string, c: Omit<CaseRow, 'id' | 'createdAt'> & { createdAt?: string }): Promise<void> {
  await db.run(
    'INSERT INTO cases (id, profile_id, case_id, verdict, answer_mode, transcript, ideas_found, misconceptions_found, child_feedback, parent_note, audio_path, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [newId(), profileId, c.caseId, c.verdict, c.answerMode, c.transcript, JSON.stringify(c.ideasFound), JSON.stringify(c.misconceptionsFound), c.childFeedback, c.parentNote, c.audioPath, c.createdAt ?? nowIso()],
  );
}
export async function listCaseAttempts(db: Db, profileId: string): Promise<CaseRow[]> {
  return (await db.all<CaseDb>('SELECT * FROM cases WHERE profile_id = ? ORDER BY created_at DESC, rowid DESC', [profileId])).map(toCase);
}
export async function casesSolvedCount(db: Db, profileId: string): Promise<number> {
  return (await db.first<{ n: number }>("SELECT COUNT(DISTINCT case_id) AS n FROM cases WHERE profile_id = ? AND verdict = 'solved'", [profileId]))!.n;
}
export async function solvedCaseIds(db: Db, profileId: string): Promise<string[]> {
  return (await db.all<{ case_id: string }>("SELECT DISTINCT case_id FROM cases WHERE profile_id = ? AND verdict = 'solved'", [profileId])).map((r) => r.case_id);
}
/** A case can be retried 24 h after the last attempt if it is not solved. */
export function canRetryCase(lastAttemptIso: string | null, solved: boolean, now: string): boolean {
  if (solved) return false;
  if (!lastAttemptIso) return true;
  return Date.parse(now) - Date.parse(lastAttemptIso) >= 24 * 3600 * 1000;
}
export async function purgeOldAudio(db: Db, profileId: string, now: string, days = 30): Promise<string[]> {
  const cutoff = new Date(Date.parse(now) - days * 86400000).toISOString();
  const rows = await db.all<{ id: string; audio_path: string }>('SELECT id, audio_path FROM cases WHERE profile_id = ? AND audio_path IS NOT NULL AND created_at < ?', [profileId, cutoff]);
  for (const r of rows) await db.run('UPDATE cases SET audio_path = NULL WHERE id = ?', [r.id]);
  return rows.map((r) => r.audio_path);
}
export async function clearRecordings(db: Db, profileId: string): Promise<string[]> {
  const rows = await db.all<{ audio_path: string }>('SELECT audio_path FROM cases WHERE profile_id = ? AND audio_path IS NOT NULL', [profileId]);
  await db.run('UPDATE cases SET audio_path = NULL WHERE profile_id = ?', [profileId]);
  return rows.map((r) => r.audio_path);
}

// ---------------------------------------------------------------- missions
export interface MissionRow { conceptId: ConceptId; status: 'open' | 'done'; answerId: string | null; photoPath: string | null; openedAt: string | null; doneAt: string | null }
interface MissionDb { concept_id: string; status: string; answer_id: string | null; photo_path: string | null; opened_at: string | null; done_at: string | null }
const toMission = (r: MissionDb): MissionRow => ({ conceptId: r.concept_id as ConceptId, status: r.status as 'open' | 'done', answerId: r.answer_id, photoPath: r.photo_path, openedAt: r.opened_at, doneAt: r.done_at });
export async function openMission(db: Db, profileId: string, conceptId: ConceptId, at = nowIso()): Promise<void> {
  await db.run("INSERT OR IGNORE INTO missions (profile_id, concept_id, status, opened_at) VALUES (?,?,'open',?)", [profileId, conceptId, at]);
}
export async function completeMission(db: Db, profileId: string, conceptId: ConceptId, answerId: string | null, photoPath: string | null, at = nowIso()): Promise<void> {
  await db.run("UPDATE missions SET status='done', answer_id=?, photo_path=?, done_at=? WHERE profile_id=? AND concept_id=?", [answerId, photoPath, at, profileId, conceptId]);
}
export async function listMissions(db: Db, profileId: string): Promise<MissionRow[]> {
  return (await db.all<MissionDb>("SELECT * FROM missions WHERE profile_id = ? ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, COALESCE(done_at, opened_at)", [profileId])).map(toMission);
}
/** Only one mission shows on Home: the oldest open one. */
export async function homeMission(db: Db, profileId: string): Promise<MissionRow | null> {
  const r = await db.first<MissionDb>("SELECT * FROM missions WHERE profile_id = ? AND status = 'open' ORDER BY opened_at, concept_id LIMIT 1", [profileId]);
  return r ? toMission(r) : null;
}

// ---------------------------------------------------------------- sky log, places, labs
export interface SkyRow { id: string; observed: string; photoPath: string | null; dataSnapshot: unknown; createdAt: string }
export async function addSky(db: Db, profileId: string, observed: string, photoPath: string | null, snapshot: unknown, at = nowIso()): Promise<void> {
  await db.run('INSERT INTO sky_log (id, profile_id, observed, photo_path, data_snapshot, created_at) VALUES (?,?,?,?,?,?)', [newId(), profileId, observed, photoPath, snapshot ? JSON.stringify(snapshot) : null, at]);
}
export async function listSky(db: Db, profileId: string): Promise<SkyRow[]> {
  return (await db.all<{ id: string; observed: string; photo_path: string | null; data_snapshot: string | null; created_at: string }>('SELECT * FROM sky_log WHERE profile_id = ? ORDER BY created_at DESC, rowid DESC', [profileId]))
    .map((r) => ({ id: r.id, observed: r.observed, photoPath: r.photo_path, dataSnapshot: r.data_snapshot ? JSON.parse(r.data_snapshot) : null, createdAt: r.created_at }));
}
export async function markPlaceFound(db: Db, profileId: string, placeId: string): Promise<boolean> {
  const r = await db.run('INSERT OR IGNORE INTO places_found (profile_id, place_id, found_at) VALUES (?,?,?)', [profileId, placeId, nowIso()]);
  return r.changes > 0;
}
export async function placesFound(db: Db, profileId: string): Promise<string[]> {
  return (await db.all<{ place_id: string }>('SELECT place_id FROM places_found WHERE profile_id = ?', [profileId])).map((r) => r.place_id);
}
export async function markLabSolved(db: Db, profileId: string, challengeId: string): Promise<boolean> {
  const r = await db.run('INSERT OR IGNORE INTO lab_solved (profile_id, challenge_id, solved_at) VALUES (?,?,?)', [profileId, challengeId, nowIso()]);
  return r.changes > 0;
}
export async function labSolved(db: Db, profileId: string): Promise<string[]> {
  return (await db.all<{ challenge_id: string }>('SELECT challenge_id FROM lab_solved WHERE profile_id = ?', [profileId])).map((r) => r.challenge_id);
}

// ---------------------------------------------------------------- why log
export interface WhyRow { id: string; conceptId: ConceptId; question: string; answer: string; inScope: boolean; source: 'faq' | 'ai' | 'offline'; createdAt: string }
export async function addWhy(db: Db, profileId: string, w: Omit<WhyRow, 'id' | 'createdAt'>): Promise<void> {
  await db.run('INSERT INTO why_log (id, profile_id, concept_id, question, answer, in_scope, source, created_at) VALUES (?,?,?,?,?,?,?,?)', [newId(), profileId, w.conceptId, w.question, w.answer, w.inScope ? 1 : 0, w.source, nowIso()]);
}
export async function listWhy(db: Db, profileId: string): Promise<WhyRow[]> {
  return (await db.all<{ id: string; concept_id: string; question: string; answer: string; in_scope: number; source: string; created_at: string }>('SELECT * FROM why_log WHERE profile_id = ? ORDER BY created_at DESC, rowid DESC', [profileId]))
    .map((r) => ({ id: r.id, conceptId: r.concept_id as ConceptId, question: r.question, answer: r.answer, inScope: r.in_scope === 1, source: r.source as WhyRow['source'], createdAt: r.created_at }));
}

// ---------------------------------------------------------------- live cache (shared across profiles)
export async function putCache(db: Db, placeId: string, kind: 'weather' | 'tide', json: unknown, fetchedAt: string): Promise<void> {
  await db.run('INSERT INTO weather_cache (place_id, kind, json, fetched_at) VALUES (?,?,?,?) ON CONFLICT(place_id, kind) DO UPDATE SET json=excluded.json, fetched_at=excluded.fetched_at', [placeId, kind, JSON.stringify(json), fetchedAt]);
}
export async function getCache<T>(db: Db, kind: 'weather' | 'tide'): Promise<{ placeId: string; fetchedAt: string; data: T }[]> {
  return (await db.all<{ place_id: string; json: string; fetched_at: string }>('SELECT * FROM weather_cache WHERE kind = ?', [kind])).map((r) => ({ placeId: r.place_id, fetchedAt: r.fetched_at, data: JSON.parse(r.json) as T }));
}
export async function lastLiveFetch(db: Db): Promise<string | null> {
  return (await db.first<{ t: string | null }>("SELECT MAX(fetched_at) AS t FROM weather_cache"))?.t ?? null;
}

// ---------------------------------------------------------------- sessions and time
export async function startSession(db: Db, profileId: string, at = nowIso()): Promise<string> {
  const id = newId();
  await db.run('INSERT INTO sessions (id, profile_id, started_at) VALUES (?,?,?)', [id, profileId, at]);
  return id;
}
/** Close a session and add its minutes to the profile total. Short or reversed sessions are ignored. */
export async function endSession(db: Db, sessionId: string, at = nowIso()): Promise<void> {
  const s = await db.first<{ profile_id: string; started_at: string; ended_at: string | null }>('SELECT * FROM sessions WHERE id = ?', [sessionId]);
  if (!s || s.ended_at) return;
  await db.run('UPDATE sessions SET ended_at = ? WHERE id = ?', [at, sessionId]);
  const mins = Math.max(0, Math.round((Date.parse(at) - Date.parse(s.started_at)) / 60000));
  if (mins > 0) await db.run('UPDATE profiles SET total_minutes = total_minutes + ? WHERE id = ?', [mins, s.profile_id]);
}
/** Minutes per IST day for the last `days` days (oldest first). Open sessions count up to `now`, capped at 3 h. */
export async function minutesPerDay(db: Db, profileId: string, now: string, days = 14): Promise<{ day: string; minutes: number }[]> {
  const rows = await db.all<{ started_at: string; ended_at: string | null }>('SELECT started_at, ended_at FROM sessions WHERE profile_id = ?', [profileId]);
  const totals = new Map<string, number>();
  for (const r of rows) {
    const end = r.ended_at ?? new Date(Math.min(Date.parse(now), Date.parse(r.started_at) + 3 * 3600000)).toISOString();
    const mins = Math.max(0, (Date.parse(end) - Date.parse(r.started_at)) / 60000);
    const k = istDayKey(r.started_at);
    totals.set(k, (totals.get(k) ?? 0) + mins);
  }
  const out: { day: string; minutes: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = istDayKey(Date.parse(now) - i * 86400000);
    out.push({ day: k, minutes: Math.round(totals.get(k) ?? 0) });
  }
  return out;
}
/** "Diary days": distinct IST days she used the app. Only counts up. */
export async function diaryDays(db: Db, profileId: string): Promise<number> {
  const rows = await db.all<{ started_at: string }>('SELECT started_at FROM sessions WHERE profile_id = ?', [profileId]);
  return new Set(rows.map((r) => istDayKey(r.started_at))).size;
}

// ---------------------------------------------------------------- settings
export async function getSetting(db: Db, key: string): Promise<string | null> {
  return (await db.first<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]))?.value ?? null;
}
export async function setSetting(db: Db, key: string, value: string): Promise<void> {
  await db.run('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
}
export async function deleteSetting(db: Db, key: string): Promise<void> { await db.run('DELETE FROM settings WHERE key = ?', [key]); }

// ---------------------------------------------------------------- export (Parent Zone)
export async function exportProfile(db: Db, profileId: string): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { exportedAt: nowIso(), app: 'GlobeProbe', version: 1 };
  out.profile = await getProfile(db, profileId);
  for (const t of PROFILE_TABLES) out[t] = await db.all<Record<string, unknown>>(`SELECT * FROM ${t} WHERE profile_id = ?`, [profileId]);
  return out;
}
