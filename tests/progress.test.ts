import { test, ok, eq, done } from './harness';
import { DatabaseSync } from 'node:sqlite';
import type { Db, SqlParam } from '@/db/types';
import { migrate } from '@/db/schema';
import * as Q from '@/db/queries';
import * as P from '@/state/progress';
import { getCase, getConcept, CASES } from '@/content';
import { dueReviews } from '@/learning/scheduler';
import { nextStop } from '@/learning/nextStop';

function memDb(): Db {
  const raw = new DatabaseSync(':memory:'); let depth = 0;
  return {
    exec: async (sql) => { raw.exec(sql); },
    run: async (sql, p: SqlParam[] = []) => ({ changes: Number(raw.prepare(sql).run(...p).changes) }),
    all: async <T,>(sql: string, p: SqlParam[] = []) => raw.prepare(sql).all(...p) as unknown as T[],
    first: async <T,>(sql: string, p: SqlParam[] = []) => (raw.prepare(sql).get(...p) as unknown as T) ?? null,
    tx: async <T,>(fn: () => Promise<T>) => { if (depth++ === 0) raw.exec('BEGIN'); try { const r = await fn(); if (--depth === 0) raw.exec('COMMIT'); return r; } catch (e) { if (--depth === 0) raw.exec('ROLLBACK'); throw e; } },
  };
}
const setup = async () => { const db = memDb(); await migrate(db); const p = await Q.createProfile(db, 'Mira', 'blue'); return { db, id: p.id }; };
const D1 = '2026-10-25T05:00:00.000Z', D1B = '2026-10-25T05:20:00.000Z', D2 = '2026-10-26T05:00:00.000Z';
const needs = Object.fromEntries(['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08'].map((c) => [c, getConcept(c).needs])) as never;

async function runStop(db: Db, id: string, cid: 'C01' | 'C02' | 'C04' | 'C07' | 'C08' | 'C03' | 'C05' | 'C06', at: string, explainFirstTry = true) {
  await P.startStop(db, id, cid, at);
  for (const s of [1, 2, 3, 4]) {
    if (s === 4) await P.answerExplain(db, id, cid, { correct: explainFirstTry, firstTry: true, withHelp: false, example: 'home', choiceId: 'r1', misconceptionId: explainFirstTry ? null : 'mx' }, at);
    await P.finishStep(db, id, cid, s, at);
  }
  await P.answerNaming(db, id, cid, 'name', 'n1', 'c', true, true, at); await P.answerNaming(db, id, cid, 'name', 'n2', 'c', true, true, at);
  await P.finishStep(db, id, cid, 5, at);
  return P.finishStep(db, id, cid, 6, at);
}

test('T4: complete C01 correctly -> Named + half stamp; Explained only after a next-day review', async () => {
  const { db, id } = await setup();
  const out = await runStop(db, id, 'C01', D1);
  eq(out.progress.level, 2); eq(out.progress.stopStep, 6); ok(!!out.progress.finishedAt, 'finished'); ok(out.missionOpened === true, 'mission opens');
  const reviews = await Q.getReviews(db, id); eq(reviews.length, 1); eq(reviews[0].dueAt, '2026-10-25T18:30:00.000Z');
  eq(dueReviews(reviews, await Q.getProgress(db, id), D1B).length, 0, 'not due the same day');
  const due = dueReviews(reviews, await Q.getProgress(db, id), D2); eq(due.map((d) => d.conceptId), ['C01']);
  const r = await P.answerExplain(db, id, 'C01', { correct: true, firstTry: true, withHelp: false, example: 'india', choiceId: 'r1', misconceptionId: null }, D2, 'review');
  eq(r.progress.level, 3); eq(r.levelChange, { from: 2, to: 3 });
  await P.scheduleReviewResult(db, id, 'C01', true, D2); eq((await Q.getReviews(db, id))[0].intervalDays, 3);
});

test('A wrong first-try Explain drops nothing in a Stop, a wrong review drops a level and resets the interval', async () => {
  const { db, id } = await setup();
  await runStop(db, id, 'C01', D1, false);
  eq((await Q.getProgress(db, id))[0].level, 2); eq((await Q.getProgress(db, id))[0].explainCorrectCount, 0);
  await Q.saveProgress(db, id, { ...(await Q.getProgress(db, id))[0], level: 3 });
  const w = await P.answerExplain(db, id, 'C01', { correct: false, firstTry: true, withHelp: false, example: 'india', choiceId: 'm', misconceptionId: 'mx' }, D2, 'review');
  eq(w.progress.level, 2); await P.scheduleReviewResult(db, id, 'C01', false, D2); eq((await Q.getReviews(db, id))[0].intervalDays, 1);
});

test('Level 1 after Watch; Level 2 after two naming answers in a row; a miss resets the run', async () => {
  const { db, id } = await setup();
  await P.startStop(db, id, 'C04', D1);
  const o = await P.finishStep(db, id, 'C04', 3, D1); eq(o.progress.level, 1); eq(o.levelChange, { from: 0, to: 1 });
  await P.answerNaming(db, id, 'C04', 'name', 'a', 'x', true, true, '2026-10-25T05:01:00Z');
  await P.answerNaming(db, id, 'C04', 'name', 'b', 'x', false, true, '2026-10-25T05:02:00Z');
  eq((await Q.getProgress(db, id)).find((p) => p.conceptId === 'C04')!.level, 1);
  await P.answerNaming(db, id, 'C04', 'duel', 'c', 'x', true, true, '2026-10-25T05:03:00Z');
  const n = await P.answerNaming(db, id, 'C04', 'name', 'd', 'x', true, true, '2026-10-25T05:04:00Z');
  eq(n.progress.level, 2);
});

test('Twist -> Mastered; Case solved -> Mastered for every concept it lists; know-it pass/fail', async () => {
  const { db, id } = await setup();
  await Q.saveProgress(db, id, { ...(await Q.getProgress(db, id))[0], level: 3, stopStep: 6 });
  eq((await P.answerTwist(db, id, 'C01', 'b', true, false, D1)).progress.level, 3);
  eq((await P.answerTwist(db, id, 'C01', 'b', true, true, D1)).progress.level, 4);
  const c1 = getCase('case1'); const res = await P.caseSolved(db, id, c1, D1); eq(res.length, c1.concepts.length);
  eq((await Q.getProgress(db, id)).find((p) => p.conceptId === c1.concepts[0])!.level, 4);
  const k = await P.knowItResult(db, id, 'C04', true, D1); eq(k.progress.level, 4); eq(k.progress.stopStep, 6); ok(k.missionOpened === true, 'mission');
  const f = await P.knowItResult(db, id, 'C05', false, D1); eq(f.progress.level, 0); eq(f.progress.knowItLastTry, D1);
});

test('Ranks: Detective after 3 Explained, Senior after 6 plus a Case, Chief after all Mastered plus 4 Cases; never down', async () => {
  const { db, id } = await setup();
  const ids = ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08'] as const;
  let rank: string | null = null;
  for (let i = 0; i < 3; i++) await Q.saveProgress(db, id, { ...(await Q.getProgress(db, id))[i], level: 3, stopStep: 6 });
  rank = await P.refreshRank(db, id); eq(rank, 'Detective');
  for (let i = 3; i < 6; i++) await Q.saveProgress(db, id, { ...(await Q.getProgress(db, id))[i], level: 3, stopStep: 6 });
  eq(await P.refreshRank(db, id), null, 'needs a case');
  await Q.saveCaseAttempt(db, id, { caseId: 'case1', verdict: 'solved', answerMode: 'build', transcript: null, ideasFound: [], misconceptionsFound: [], childFeedback: null, parentNote: null, audioPath: null });
  eq(await P.refreshRank(db, id), 'Senior Detective');
  for (const c of ids) await Q.saveProgress(db, id, { ...(await Q.getProgress(db, id)).find((p) => p.conceptId === c)!, level: 4, stopStep: 6 });
  for (const n of ['case2', 'case3', 'case4']) await Q.saveCaseAttempt(db, id, { caseId: n, verdict: 'solved', answerMode: 'build', transcript: null, ideasFound: [], misconceptionsFound: [], childFeedback: null, parentNote: null, audioPath: null });
  eq(await P.refreshRank(db, id), 'Chief Detective');
  await Q.saveProgress(db, id, { ...(await Q.getProgress(db, id))[0], level: 0 });
  eq(await P.refreshRank(db, id), null); eq((await Q.getProfile(db, id))!.rank, 'Chief Detective');
});

test('Case unlock: every needs concept at least Explained', async () => {
  const { db, id } = await setup();
  const c = getCase('case1'); eq(P.caseUnlocked(c, await Q.getProgress(db, id)), false);
  for (const n of c.needs) await Q.saveProgress(db, id, { ...(await Q.getProgress(db, id)).find((p) => p.conceptId === n)!, level: 3 });
  eq(P.caseUnlocked(c, await Q.getProgress(db, id)), true);
  ok(CASES.every((x) => x.needs.length > 0), 'all cases have needs');
});

test('Flow: finish C01 then Continue rotates to C02 (unlocked by the finished Stop, not by Explained)', async () => {
  const { db, id } = await setup();
  await runStop(db, id, 'C01', D1);
  eq(nextStop(await Q.getProgress(db, id), needs, null), 'C02');
  await runStop(db, id, 'C02', D1B);
  eq(nextStop(await Q.getProgress(db, id), needs, null), 'C01', 'rotates back: C02 was last, lowest other open is C01');
});

test('Resume: killing the app mid-Stop keeps the last finished step', async () => {
  const { db, id } = await setup();
  await P.startStop(db, id, 'C07', D1); await P.finishStep(db, id, 'C07', 1, D1); await P.finishStep(db, id, 'C07', 2, D1);
  const p = (await Q.getProgress(db, id)).find((x) => x.conceptId === 'C07')!; eq(p.stopStep, 2); ok(!!p.startedAt && !p.finishedAt, 'in progress');
  eq(nextStop(await Q.getProgress(db, id), needs, null), 'C07');
});
done();
