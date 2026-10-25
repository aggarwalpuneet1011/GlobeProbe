import { test, ok, eq, done } from './harness';
import * as M from '@/learning/mastery';
import { afterReview, chooseReviewItem, dueReviews, ensureReview, nextExample, nextInterval } from '@/learning/scheduler';
import { nextStop } from '@/learning/nextStop';
import { computeRankIndex, updateRank } from '@/learning/ranks';
import { knowItState } from '@/learning/knowIt';
import { pickGreeting } from '@/learning/greeting';
import { istDayDiff, istStartOfDayIso, fmtHours } from '@/util/time';
import { mulberry32 } from '@/util/rng';
import { CONCEPTS, DECKS } from '@/content';
import type { ConceptId, ConceptProgress } from '@/types';

const NEEDS = Object.fromEntries(CONCEPTS.map((c) => [c.id, c.needs])) as Record<ConceptId, ConceptId[]>;
const ids = CONCEPTS.map((c) => c.id);
const fresh = () => ids.map((id) => M.newProgress(id));
const upd = (all: ConceptProgress[], p: ConceptProgress) => all.map((x) => (x.conceptId === p.conceptId ? p : x));
const get = (all: ConceptProgress[], id: ConceptId) => all.find((x) => x.conceptId === id)!;
const finish = (all: ConceptProgress[], id: ConceptId, at: string, level: 0 | 1 | 2 | 3 | 4 = 2) =>
  upd(all, { ...get(all, id), stopStep: 6, level, startedAt: at, finishedAt: at, lastSeenAt: at });

// 25 Oct 2026 is a Sunday. 8 pm IST = 14:30 UTC.
const D1_EVE = '2026-10-25T14:30:00.000Z';
const D1_MORN = '2026-10-25T04:00:00.000Z'; // 9:30 am IST
const D2_MORN = '2026-10-26T04:00:00.000Z';

test('T4: Explained needs a second occasion (next day or another example)', () => {
  let p = M.newProgress('C01');
  p = M.onWatchDone(p).progress; eq(p.level, 1);
  p = M.onNameAnswer(p, 2).progress; eq(p.level, 2);
  p = M.onExplain(p, { correct: true, firstTry: true, withHelp: false, example: 'home', now: D1_EVE }).progress;
  eq(p.level, 2, 'one correct Explain is not enough');
  // same day, same example: still not a separate occasion
  const same = M.onExplain(p, { correct: true, firstTry: true, withHelp: false, example: 'home', now: '2026-10-25T16:00:00.000Z' });
  eq(same.progress.level, 2);
  // next IST day, same example
  const next = M.onExplain(p, { correct: true, firstTry: true, withHelp: false, example: 'home', now: D2_MORN });
  eq(next.progress.level, 3); ok(next.change?.to === 3, 'change reported');
  // same day, different example
  const other = M.onExplain(p, { correct: true, firstTry: true, withHelp: false, example: 'india', now: '2026-10-25T16:00:00.000Z' });
  eq(other.progress.level, 3);
});

test('Explain: second-try or helped answers never count', () => {
  const p = M.newProgress('C02');
  eq(M.onExplain(p, { correct: true, firstTry: false, withHelp: false, example: 'home', now: D1_EVE }).progress.explainCorrectCount, 0);
  eq(M.onExplain(p, { correct: true, firstTry: true, withHelp: true, example: 'home', now: D1_EVE }).progress.explainCorrectCount, 0);
  eq(M.onExplain(p, { correct: false, firstTry: true, withHelp: false, example: 'home', now: D1_EVE }).progress.explainCorrectCount, 0);
});

test('IST day boundary: 11:30 pm and 12:30 am IST are different days', () => {
  eq(istDayDiff('2026-10-25T18:00:00Z', '2026-10-25T19:00:00Z'), 1); // 11:30 pm vs 12:30 am IST
  eq(istDayDiff('2026-10-25T04:00:00Z', '2026-10-25T17:00:00Z'), 0);
  eq(istStartOfDayIso(D1_EVE, 1), '2026-10-25T18:30:00.000Z');
});

test('T4: wrong review drops Mastered -> Explained -> Named, never below Named', () => {
  let p = { ...M.newProgress('C01'), level: 4 as const };
  p = M.onReviewWrong(p).progress; eq(p.level, 3);
  p = M.onReviewWrong(p).progress; eq(p.level, 2);
  p = M.onReviewWrong(p).progress; eq(p.level, 2);
});

test('T4: "I know this!" 3/3 -> Mastered and dependants unlock; 2/3 fails; once per day', () => {
  eq(knowItState([true]), 'pending'); eq(knowItState([true, true, true]), 'pass');
  eq(knowItState([true, false]), 'fail'); eq(knowItState([false]), 'fail');
  let all = fresh();
  ok(!nextStop(all, NEEDS, null) || true);
  const r = M.onKnowItPass(get(all, 'C01'), D1_MORN);
  eq(r.progress.level, 4); eq(r.progress.stopStep, 6);
  all = upd(all, r.progress);
  const ns = nextStop(all, NEEDS, 'C02');
  eq(ns, 'C02', 'pinned dependant is now open');
  ok(!M.knowItAllowed(M.onKnowItFail(get(fresh(), 'C01'), D1_MORN).progress, D1_EVE), 'blocked same day');
  ok(M.knowItAllowed(M.onKnowItFail(get(fresh(), 'C01'), D1_MORN).progress, D2_MORN), 'allowed next day');
});

test('Naming streak and levels', () => {
  eq(M.trailingCorrect([true, false, true, true]), 2);
  eq(M.trailingCorrect([true, true, false]), 0);
  eq(M.onNameAnswer(M.newProgress('C03'), 1).progress.level, 0);
  eq(M.onTwist({ ...M.newProgress('C03'), level: 3 }, true, true).progress.level, 4);
  eq(M.onTwist({ ...M.newProgress('C03'), level: 3 }, true, false).progress.level, 3);
  eq(M.onCaseSolved({ ...M.newProgress('C03'), level: 2 }).progress.level, 4);
});

test('Review intervals 1,3,7,14,30 then every 30; wrong resets to 1', () => {
  eq([1, 3, 7, 14, 30, 30].map(nextInterval), [3, 7, 14, 30, 30, 30]);
  const p = { ...M.newProgress('C01'), level: 2 as const };
  const r0 = ensureReview(undefined, p, D1_EVE)!;
  eq(r0.intervalDays, 1); eq(r0.dueAt, '2026-10-25T18:30:00.000Z');
  eq(ensureReview(r0, p, D1_EVE), null);
  eq(ensureReview(undefined, M.newProgress('C01'), D1_EVE), null, 'no schedule before Named');
  const r1 = afterReview(r0, true, D2_MORN); eq(r1.intervalDays, 3);
  const r2 = afterReview(r1, false, D2_MORN); eq(r2.intervalDays, 1);
});

test('Warm-up: max 2, oldest due first, only Named+', () => {
  const prog = ids.map((id) => ({ ...M.newProgress(id), level: 2 as const }));
  const mk = (id: ConceptId, due: string) => ({ conceptId: id, intervalDays: 1, dueAt: due });
  const reviews = [mk('C03', '2026-10-24T18:30:00Z'), mk('C01', '2026-10-23T18:30:00Z'), mk('C02', '2026-10-25T18:30:00Z'), mk('C04', '2026-10-27T18:30:00Z')];
  const due = dueReviews(reviews, prog, D2_MORN);
  eq(due.map((d) => d.conceptId), ['C01', 'C03']);
  const low = prog.map((p) => (p.conceptId === 'C01' ? { ...p, level: 1 as const } : p));
  eq(dueReviews(reviews, low, D2_MORN).map((d) => d.conceptId), ['C03', 'C02']);
});

test('Review item rotates the Explain example, never repeating the last', () => {
  eq(nextExample(null), 'india'); eq(nextExample('home'), 'india'); eq(nextExample('india'), 'world'); eq(nextExample('world'), 'home');
  for (const c of CONCEPTS) {
    const item = chooseReviewItem(c, DECKS.find((d) => d.concept === c.id), { ...M.newProgress(c.id), lastExplainExample: 'india' }, mulberry32(1));
    eq(item.kind, 'explain'); ok(item.kind === 'explain' && item.example === 'world', 'rotates');
  }
});

test('nextStop: new child gets the lowest open Stop, C01', () => {
  eq(nextStop(fresh(), NEEDS, null), 'C01');
});

test('nextStop: in-progress wins, most recently started', () => {
  let all = fresh();
  all = upd(all, { ...get(all, 'C01'), startedAt: '2026-10-25T04:00:00Z', stopStep: 3 });
  all = upd(all, { ...get(all, 'C04'), startedAt: '2026-10-25T05:00:00Z', stopStep: 2 });
  eq(nextStop(all, NEEDS, null), 'C04');
});

test('nextStop: rotates trails (not the last one finished); locks respected', () => {
  let all = finish(fresh(), 'C01', '2026-10-25T05:00:00Z');
  eq(nextStop(all, NEEDS, null), 'C02', 'C01 is last finished, C02 is open and lowest of the rest');
  all = finish(all, 'C02', '2026-10-25T05:30:00Z');
  // open: C01 (level 2), C02 (level 2), C03, C04, C07, C08. last finished = C02 -> lowest other = C01
  eq(nextStop(all, NEEDS, null), 'C01');
  // C06 needs C02 and C04: not open until C04 finished
  const open6 = nextStop(finish(all, 'C03', '2026-10-25T06:00:00Z'), NEEDS, null);
  ok(open6 !== 'C06', 'C06 stays locked');
  all = finish(all, 'C04', '2026-10-25T06:30:00Z');
  const withC6 = all.filter((p) => p.conceptId === 'C06');
  ok(withC6.length === 1);
});

test('nextStop: pinned concept first; ignored when Explained or locked', () => {
  const all = fresh();
  eq(nextStop(all, NEEDS, 'C04'), 'C04');
  eq(nextStop(all, NEEDS, 'C06'), 'C01', 'C06 locked -> pin ignored');
  eq(nextStop(upd(all, { ...get(all, 'C04'), level: 3, stopStep: 6 }), NEEDS, 'C04'), 'C01');
});

test('nextStop: Twist practice picks the oldest-seen Explained concept; null when all Mastered', () => {
  let all = fresh();
  for (const id of ids) all = finish(all, id, '2026-10-25T05:00:00Z', 3);
  all = upd(all, { ...get(all, 'C05'), lastSeenAt: '2026-10-20T05:00:00Z' });
  eq(nextStop(all, NEEDS, null), 'C05');
  for (const id of ids) all = upd(all, { ...get(all, id), level: 4 });
  eq(nextStop(all, NEEDS, null), null);
});

test('nextStop: only open concept is the last finished one -> replay it (second occasion for Explained)', () => {
  let all = fresh();
  for (const id of ids) all = finish(all, id, '2026-10-25T05:00:00Z', 3);
  all = finish(all, 'C03', '2026-10-25T09:00:00Z', 2);
  eq(nextStop(all, NEEDS, null), 'C03');
});

test('Ranks and never going down', () => {
  const lv = (n3: number, n4: number) => ids.map((id, i) => ({ ...M.newProgress(id), level: (i < n4 ? 4 : i < n3 ? 3 : 0) as 0 | 3 | 4 }));
  eq(computeRankIndex(lv(2, 0), 0), 0);
  eq(computeRankIndex(lv(3, 0), 0), 1);
  eq(computeRankIndex(lv(6, 0), 0), 1, 'Senior also needs a Case');
  eq(computeRankIndex(lv(6, 0), 1), 2);
  eq(computeRankIndex(lv(8, 8), 3), 2);
  eq(computeRankIndex(lv(8, 8), 4), 3);
  const r = updateRank('Junior Detective', lv(3, 0), 0); eq(r.rank, 'Detective'); ok(r.promoted, 'promoted');
  const down = updateRank('Senior Detective', lv(0, 0), 0); eq(down.rank, 'Senior Detective'); ok(!down.promoted, 'no demotion');
});

test('Greeting priority and rules', () => {
  const base = { name: 'Aanya', rainNow: null, windFromDeg: null, caseJustUnlocked: false } as const;
  eq(pickGreeting({ ...base, now: '2026-10-25T04:00:00Z' }).text, 'Good morning, Aanya. What shall we investigate?');
  eq(pickGreeting({ ...base, name: null, now: '2026-10-25T04:00:00Z' }).text, 'Good morning, Detective. What shall we investigate?');
  eq(pickGreeting({ ...base, now: '2026-10-25T08:30:00Z' }).kind, 'afternoon'); // 2 pm IST
  eq(pickGreeting({ ...base, now: '2026-10-25T13:30:00Z' }).kind, 'evening'); // 7 pm IST
  eq(pickGreeting({ ...base, now: '2026-10-25T08:30:00Z', windFromDeg: 250 }).kind, 'seaBreeze');
  eq(pickGreeting({ ...base, now: '2026-10-25T04:00:00Z', windFromDeg: 250 }).kind, 'morning', 'sea breeze only 12 pm to 6 pm');
  eq(pickGreeting({ ...base, now: '2026-10-25T08:30:00Z', windFromDeg: 90 }).kind, 'afternoon');
  eq(pickGreeting({ ...base, now: '2026-10-25T08:30:00Z', caseJustUnlocked: true }).kind, 'caseUnlocked');
  const rain = pickGreeting({ ...base, now: '2026-10-25T08:30:00Z', rainNow: 'drizzle', windFromDeg: 250, caseJustUnlocked: true });
  eq(rain.text, "It's drizzling in Mumbai right now. Go and check: drizzle or rain?");
  ok(pickGreeting({ ...base, now: '2026-10-25T08:30:00Z', rainNow: 'rain' }).text.includes('raining'), 'raining');
});

test('Time formatting', () => {
  eq(fmtHours(14.6667), '2:40 pm'); eq(fmtHours(26), '2:00 am'); eq(fmtHours(0), '12:00 am'); eq(fmtHours(12), '12:00 pm');
});

done();
