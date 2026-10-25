import { test, ok, eq, done } from './harness';
import { DatabaseSync } from 'node:sqlite';
import type { Db, SqlParam } from '@/db/types';
import { migrate, SCHEMA_VERSION } from '@/db/schema';
import * as Q from '@/db/queries';
import * as M from '@/learning/mastery';

function memDb(): Db {
  const raw = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: async (sql) => { raw.exec(sql); },
    run: async (sql, p: SqlParam[] = []) => ({ changes: Number(raw.prepare(sql).run(...p).changes) }),
    all: async <T,>(sql: string, p: SqlParam[] = []) => raw.prepare(sql).all(...p) as unknown as T[],
    first: async <T,>(sql: string, p: SqlParam[] = []) => (raw.prepare(sql).get(...p) as unknown as T) ?? null,
    tx: async <T,>(fn: () => Promise<T>) => {
      if (depth++ === 0) raw.exec('BEGIN');
      try { const r = await fn(); if (--depth === 0) raw.exec('COMMIT'); return r; } catch (e) { if (--depth === 0) raw.exec('ROLLBACK'); throw e; }
    },
  };
}
const fresh = async () => { const db = memDb(); await migrate(db); return db; };

test('Migrations: user_version set, idempotent', async () => {
  const db = memDb(); await migrate(db); await migrate(db);
  eq((await db.first<{ user_version: number }>('PRAGMA user_version'))!.user_version, SCHEMA_VERSION);
});

test('Profiles: max 4, name max 12 chars, rank starts Junior, progress rows for all 8 concepts', async () => {
  const db = await fresh();
  const p = await Q.createProfile(db, '  Anaya-Long-Name-Here ', 'teal');
  eq(p.name.length, 12); eq(p.rank, 'Junior Detective'); eq(p.readAloud, true);
  eq((await Q.getProgress(db, p.id)).length, 8);
  await Q.createProfile(db, 'B', 'blue'); await Q.createProfile(db, 'C', 'coral'); await Q.createProfile(db, 'D', 'purple');
  try { await Q.createProfile(db, 'E', 'blue'); ok(false, 'throw'); } catch (e) { ok(/Max/.test((e as Error).message), 'max'); }
  try { await Q.createProfile(db, '   ', 'blue'); ok(false, 'throw'); } catch { /* ok */ }
});

test('Progress round-trips every field', async () => {
  const db = await fresh(); const p = await Q.createProfile(db, 'Mira', 'blue');
  const prog = { ...M.newProgress('C03'), level: 3 as const, stopStep: 6, explainCorrectCount: 2, lastExplainExample: 'india' as const, lastExplainAt: '2026-10-25T05:00:00Z', twistPassed: true, knowItLastTry: '2026-10-24T05:00:00Z', lastSeenAt: '2026-10-25T06:00:00Z', startedAt: '2026-10-25T04:00:00Z', finishedAt: '2026-10-25T04:10:00Z' };
  await Q.saveProgress(db, p.id, prog);
  eq((await Q.getProgress(db, p.id)).find((x) => x.conceptId === 'C03'), prog);
});

test('Profiles are isolated', async () => {
  const db = await fresh(); const a = await Q.createProfile(db, 'A', 'blue'); const b = await Q.createProfile(db, 'B', 'teal');
  await Q.saveProgress(db, a.id, { ...M.newProgress('C01'), level: 4, stopStep: 6 });
  eq((await Q.getProgress(db, b.id)).find((x) => x.conceptId === 'C01')!.level, 0);
  await Q.addAttempt(db, a.id, { conceptId: 'C01', kind: 'explain', itemId: 'e', choiceId: 'r1', correct: true, firstTry: true });
  eq((await Q.explainAccuracy(db, b.id, 'C01')), null);
});

test('Reviews upsert; attempts and the misconception counter (times, cleared after two correct Explains)', async () => {
  const db = await fresh(); const p = await Q.createProfile(db, 'Mira', 'blue');
  await Q.saveReview(db, p.id, { conceptId: 'C01', dueAt: '2026-10-26T18:30:00Z', intervalDays: 1 });
  await Q.saveReview(db, p.id, { conceptId: 'C01', dueAt: '2026-10-28T18:30:00Z', intervalDays: 3 });
  eq(await Q.getReviews(db, p.id), [{ conceptId: 'C01', dueAt: '2026-10-28T18:30:00Z', intervalDays: 3 }]);
  await Q.addAttempt(db, p.id, { conceptId: 'C06', kind: 'explain', itemId: 'x', choiceId: 'm_wall', correct: false, firstTry: true, misconceptionId: 'm_wall' });
  await Q.addAttempt(db, p.id, { conceptId: 'C06', kind: 'explain', itemId: 'x', choiceId: 'm_wall', correct: false, firstTry: true, misconceptionId: 'm_wall' });
  eq((await Q.listMisconceptions(db, p.id))[0], { id: 'm_wall', times: 2, cleared: false, lastAt: (await Q.listMisconceptions(db, p.id))[0].lastAt });
  await Q.noteCorrectExplain(db, p.id, ['m_wall']); eq((await Q.listMisconceptions(db, p.id))[0].cleared, false);
  await Q.noteCorrectExplain(db, p.id, ['m_wall']); eq((await Q.listMisconceptions(db, p.id))[0].cleared, true);
  await Q.addAttempt(db, p.id, { conceptId: 'C06', kind: 'explain', itemId: 'x', choiceId: 'm_wall', correct: false, firstTry: true, misconceptionId: 'm_wall' });
  const m = (await Q.listMisconceptions(db, p.id))[0]; eq(m.cleared, false); eq(m.times, 3);
});

test('Name streak and Explain accuracy come from attempts', async () => {
  const db = await fresh(); const p = await Q.createProfile(db, 'Mira', 'blue');
  const add = (kind: 'name' | 'duel' | 'explain', correct: boolean, firstTry = true, at = '2026-10-25T05:00:00Z') => Q.addAttempt(db, p.id, { conceptId: 'C01', kind, itemId: 'i', choiceId: 'c', correct, firstTry, at });
  await add('name', true, true, '2026-10-25T05:00:01Z'); await add('duel', false, true, '2026-10-25T05:00:02Z'); await add('name', true, true, '2026-10-25T05:00:03Z'); await add('name', true, false, '2026-10-25T05:00:04Z');
  eq(await Q.recentNameResults(db, p.id, 'C01'), [true, false, true]);
  eq(M.trailingCorrect(await Q.recentNameResults(db, p.id, 'C01')), 1);
  await add('explain', true); await add('explain', false); await add('explain', true, false);
  eq(await Q.explainAccuracy(db, p.id, 'C01'), { firstTry: 2, correct: 1 });
});

test('Cases: save, solved count, 24 h retry rule, recordings purge after 30 days', async () => {
  const db = await fresh(); const p = await Q.createProfile(db, 'Mira', 'blue');
  const base = { caseId: 'case1', answerMode: 'speak', transcript: 't', ideasFound: ['k1'], misconceptionsFound: [], childFeedback: 'f', parentNote: 'n', audioPath: 'audio/x.m4a' };
  await Q.saveCaseAttempt(db, p.id, { ...base, verdict: 'almost', createdAt: '2026-09-01T05:00:00Z' });
  await Q.saveCaseAttempt(db, p.id, { ...base, verdict: 'solved', createdAt: '2026-10-24T05:00:00Z', audioPath: 'audio/y.m4a' });
  eq(await Q.casesSolvedCount(db, p.id), 1); eq(await Q.solvedCaseIds(db, p.id), ['case1']);
  eq((await Q.listCaseAttempts(db, p.id))[0].ideasFound, ['k1']);
  eq(Q.canRetryCase('2026-10-25T00:00:00Z', false, '2026-10-25T10:00:00Z'), false); eq(Q.canRetryCase('2026-10-24T09:00:00Z', false, '2026-10-25T10:00:00Z'), true);
  eq(Q.canRetryCase('2026-10-01T00:00:00Z', true, '2026-10-25T10:00:00Z'), false); eq(Q.canRetryCase(null, false, '2026-10-25T10:00:00Z'), true);
  eq(await Q.purgeOldAudio(db, p.id, '2026-10-25T10:00:00Z'), ['audio/x.m4a']);
  eq(await Q.clearRecordings(db, p.id), ['audio/y.m4a']);
});

test('Missions: one on Home (oldest open), complete with photo, never expire', async () => {
  const db = await fresh(); const p = await Q.createProfile(db, 'Mira', 'blue');
  await Q.openMission(db, p.id, 'C03', '2026-10-25T05:00:00Z'); await Q.openMission(db, p.id, 'C01', '2026-10-24T05:00:00Z'); await Q.openMission(db, p.id, 'C01', '2026-10-26T05:00:00Z');
  eq((await Q.homeMission(db, p.id))!.conceptId, 'C01');
  await Q.completeMission(db, p.id, 'C01', 'a', 'photos/x.jpg', '2026-10-27T05:00:00Z');
  eq((await Q.homeMission(db, p.id))!.conceptId, 'C03');
  const l = await Q.listMissions(db, p.id); eq(l.map((m) => m.conceptId + m.status), ['C03open', 'C01done']); eq(l[1].photoPath, 'photos/x.jpg');
});

test('Sky log, places, labs, why log, settings, cache', async () => {
  const db = await fresh(); const p = await Q.createProfile(db, 'Mira', 'blue');
  await Q.addSky(db, p.id, 'Drizzle', null, { code: 51, mm: 0.4 }); eq((await Q.listSky(db, p.id))[0].dataSnapshot, { code: 51, mm: 0.4 });
  eq(await Q.markPlaceFound(db, p.id, 'sri_lanka'), true); eq(await Q.markPlaceFound(db, p.id, 'sri_lanka'), false); eq(await Q.placesFound(db, p.id), ['sri_lanka']);
  eq(await Q.markLabSolved(db, p.id, 'c06_l1'), true); eq(await Q.markLabSolved(db, p.id, 'c06_l1'), false); eq(await Q.labSolved(db, p.id), ['c06_l1']);
  await Q.addWhy(db, p.id, { conceptId: 'C02', question: 'q', answer: 'a', inScope: false, source: 'ai' }); eq((await Q.listWhy(db, p.id))[0].inScope, false);
  eq(await Q.getSetting(db, 'sound'), null); await Q.setSetting(db, 'sound', 'off'); await Q.setSetting(db, 'sound', 'on'); eq(await Q.getSetting(db, 'sound'), 'on'); await Q.deleteSetting(db, 'sound'); eq(await Q.getSetting(db, 'sound'), null);
  await Q.putCache(db, 'mum', 'weather', { a: 1 }, '2026-10-25T05:00:00Z'); await Q.putCache(db, 'mum', 'weather', { a: 2 }, '2026-10-25T06:00:00Z');
  eq((await Q.getCache<{ a: number }>(db, 'weather'))[0].data.a, 2); eq(await Q.lastLiveFetch(db), '2026-10-25T06:00:00Z');
});

test('Sessions: minutes per IST day (14 days), total minutes, diary days only count up', async () => {
  const db = await fresh(); const p = await Q.createProfile(db, 'Mira', 'blue');
  const s1 = await Q.startSession(db, p.id, '2026-10-24T04:00:00Z'); await Q.endSession(db, s1, '2026-10-24T04:20:00Z');
  const s2 = await Q.startSession(db, p.id, '2026-10-25T04:00:00Z'); await Q.endSession(db, s2, '2026-10-25T04:05:00Z'); await Q.endSession(db, s2, '2026-10-25T09:00:00Z');
  const s3 = await Q.startSession(db, p.id, '2026-10-25T06:00:00Z');
  const days = await Q.minutesPerDay(db, p.id, '2026-10-25T06:10:00Z'); eq(days.length, 14);
  eq(days[13], { day: '2026-10-25', minutes: 15 }); eq(days[12], { day: '2026-10-24', minutes: 20 });
  eq((await Q.getProfile(db, p.id))!.totalMinutes, 25); eq(await Q.diaryDays(db, p.id), 2); void s3;
});

test('Reset keeps the profile; delete removes everything and returns file paths', async () => {
  const db = await fresh(); const p = await Q.createProfile(db, 'Mira', 'blue');
  await Q.saveProgress(db, p.id, { ...M.newProgress('C01'), level: 4, stopStep: 6 }); await Q.updateProfile(db, p.id, { rank: 'Detective', schoolSyncConcept: 'C04' });
  await Q.openMission(db, p.id, 'C01'); await Q.completeMission(db, p.id, 'C01', 'a', 'photos/p.jpg');
  await Q.addSky(db, p.id, 'Sunny', 'photos/s.jpg', null);
  await Q.saveCaseAttempt(db, p.id, { caseId: 'case1', verdict: 'almost', answerMode: 'type', transcript: null, ideasFound: [], misconceptionsFound: [], childFeedback: null, parentNote: null, audioPath: 'audio/a.m4a' });
  const exp = await Q.exportProfile(db, p.id); ok(Array.isArray(exp.missions) && (exp.missions as unknown[]).length === 1, 'export has missions');
  const files = await Q.resetProfile(db, p.id); eq(files.sort(), ['audio/a.m4a', 'photos/p.jpg', 'photos/s.jpg']);
  const r = (await Q.getProfile(db, p.id))!; eq(r.rank, 'Junior Detective'); eq(r.schoolSyncConcept, null); eq((await Q.getProgress(db, p.id)).every((x) => x.level === 0), true); eq((await Q.listMissions(db, p.id)).length, 0);
  await Q.deleteProfile(db, p.id); eq(await Q.getProfile(db, p.id), null); eq((await Q.listProfiles(db)).length, 0);
});
done();
