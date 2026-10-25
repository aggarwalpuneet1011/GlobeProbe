// Progression service: applies learning events to the database. All rules live in src/learning; this only persists them.
import type { Db } from '../db/types';
import type { CaseFile, ConceptId, ConceptProgress, ExampleKind, Level, ReviewKind } from '../types';
import * as Q from '../db/queries';
import * as M from '../learning/mastery';
import { afterReview, ensureReview } from '../learning/scheduler';
import { updateRank } from '../learning/ranks';
import { getConcept } from '../content';
import { nowIso } from '../util/time';

export interface Outcome {
  progress: ConceptProgress;
  levelChange: { from: Level; to: Level } | null;
  rankUp: string | null;          // new rank word when it changed
  halfStamp?: boolean;            // first correct Explain: half-inked stamp
  missionOpened?: boolean;
}

async function load(db: Db, profileId: string, id: ConceptId): Promise<ConceptProgress> {
  return (await Q.getProgress(db, profileId)).find((p) => p.conceptId === id)!;
}

/** Re-evaluate the rank after any change. Ranks never go down. */
export async function refreshRank(db: Db, profileId: string): Promise<string | null> {
  const profile = (await Q.getProfile(db, profileId))!;
  const r = updateRank(profile.rank, await Q.getProgress(db, profileId), await Q.casesSolvedCount(db, profileId));
  if (r.promoted) { await Q.updateProfile(db, profileId, { rank: r.rank }); return r.rank; }
  return null;
}

async function finish(db: Db, profileId: string, before: ConceptProgress, res: M.Result, now: string, extra: Partial<Outcome> = {}): Promise<Outcome> {
  const p = { ...res.progress, lastSeenAt: now };
  await Q.saveProgress(db, profileId, p);
  if (p.level >= 2) {
    const have = (await Q.getReviews(db, profileId)).find((r) => r.conceptId === p.conceptId);
    const created = ensureReview(have, p, now);
    if (created) await Q.saveReview(db, profileId, created);
  }
  const rankUp = await refreshRank(db, profileId);
  void before;
  return { progress: p, levelChange: res.change, rankUp, ...extra };
}

/** Opening a Stop (or resuming it). */
export async function startStop(db: Db, profileId: string, conceptId: ConceptId, now = nowIso()): Promise<ConceptProgress> {
  const p = await load(db, profileId, conceptId);
  const next = { ...p, startedAt: p.startedAt ?? now, lastSeenAt: now };
  await Q.saveProgress(db, profileId, next);
  return next;
}

/** Replaying a finished Stop: step state restarts but the finished flag and level stay. */
export async function restartStop(db: Db, profileId: string, conceptId: ConceptId, now = nowIso()): Promise<ConceptProgress> {
  const p = await load(db, profileId, conceptId);
  const next = { ...p, startedAt: now, lastSeenAt: now, stopStep: Math.min(p.stopStep, 6) };
  await Q.saveProgress(db, profileId, next);
  return next;
}

/** A step is finished (1 Hook, 2 Predict, 3 Watch, 4 Explain, 5 Name it, 6 Stamp). Progress is written every step. */
export async function finishStep(db: Db, profileId: string, conceptId: ConceptId, step: number, now = nowIso()): Promise<Outcome> {
  const p = await load(db, profileId, conceptId);
  let res: M.Result = { progress: { ...p, stopStep: Math.max(p.stopStep, step), startedAt: p.startedAt ?? now }, change: null };
  if (step >= 3) {
    const w = M.onWatchDone(res.progress);
    res = { progress: w.progress, change: w.change };
  }
  let missionOpened = false;
  if (step >= 6 && !res.progress.finishedAt) {
    res = { progress: { ...res.progress, finishedAt: now }, change: res.change };
    await Q.openMission(db, profileId, conceptId, now);
    missionOpened = true;
  }
  return finish(db, profileId, p, res, now, { missionOpened });
}

export interface ExplainAnswer { correct: boolean; firstTry: boolean; withHelp: boolean; example: ExampleKind; choiceId: string; misconceptionId: string | null; itemId?: string }
export async function answerExplain(db: Db, profileId: string, conceptId: ConceptId, a: ExplainAnswer, now = nowIso(), kind: 'explain' | 'review' = 'explain'): Promise<Outcome> {
  const p = await load(db, profileId, conceptId);
  await Q.addAttempt(db, profileId, { conceptId, kind, itemId: a.itemId ?? `${conceptId}:explain`, choiceId: a.choiceId, correct: a.correct, firstTry: a.firstTry, withHelp: a.withHelp, misconceptionId: a.misconceptionId, at: now });
  let halfStamp = false;
  let res: M.Result;
  if (a.correct && a.firstTry && !a.withHelp) {
    res = M.onExplain(p, { correct: true, firstTry: true, withHelp: false, example: a.example, now });
    halfStamp = res.progress.level < 3 && res.progress.explainCorrectCount >= 1;
    const concept = getConcept(conceptId);
    await Q.noteCorrectExplain(db, profileId, concept.explain.misconceptions.map((m) => m.id));
  } else if (kind === 'review' && !a.correct) {
    res = M.onReviewWrong(p);
  } else {
    res = { progress: p, change: null };
  }
  return finish(db, profileId, p, res, now, { halfStamp });
}

/** Stop step 5 or a Duel item for this concept. Level 2 needs two correct in a row. */
export async function answerNaming(db: Db, profileId: string, conceptId: ConceptId, kind: 'name' | 'duel', itemId: string, choiceId: string, correct: boolean, firstTry: boolean, now = nowIso()): Promise<Outcome> {
  await Q.addAttempt(db, profileId, { conceptId, kind, itemId, choiceId, correct, firstTry, at: now });
  const p = await load(db, profileId, conceptId);
  const streak = M.trailingCorrect(await Q.recentNameResults(db, profileId, conceptId));
  return finish(db, profileId, p, M.onNameAnswer(p, streak), now);
}

export async function answerTwist(db: Db, profileId: string, conceptId: ConceptId, choiceId: string, correct: boolean, firstTry: boolean, now = nowIso()): Promise<Outcome> {
  await Q.addAttempt(db, profileId, { conceptId, kind: 'twist', itemId: `${conceptId}:twist`, choiceId, correct, firstTry, at: now });
  const p = await load(db, profileId, conceptId);
  return finish(db, profileId, p, M.onTwist(p, correct, firstTry), now);
}

/** Answer to a Warm-up review item (explain reviews go through answerExplain with kind 'review'). */
export async function answerReview(db: Db, profileId: string, conceptId: ConceptId, kind: Exclude<ReviewKind, 'explain'>, itemId: string, choiceId: string, correct: boolean, now = nowIso()): Promise<Outcome> {
  await Q.addAttempt(db, profileId, { conceptId, kind: 'review', itemId: `${kind}:${itemId}`, choiceId, correct, firstTry: true, at: now });
  const p = await load(db, profileId, conceptId);
  return finish(db, profileId, p, correct ? { progress: p, change: null } : M.onReviewWrong(p), now);
}

/** Close out a review: correct moves to the next interval, wrong resets to 1 day. */
export async function scheduleReviewResult(db: Db, profileId: string, conceptId: ConceptId, correct: boolean, now = nowIso()): Promise<void> {
  const r = (await Q.getReviews(db, profileId)).find((x) => x.conceptId === conceptId);
  if (r) await Q.saveReview(db, profileId, afterReview(r, correct, now));
}

export async function knowItResult(db: Db, profileId: string, conceptId: ConceptId, passed: boolean, now = nowIso()): Promise<Outcome> {
  const p = await load(db, profileId, conceptId);
  await Q.addAttempt(db, profileId, { conceptId, kind: 'knowit', itemId: `${conceptId}:knowit`, choiceId: passed ? 'pass' : 'fail', correct: passed, firstTry: true, at: now });
  if (passed) {
    const res = M.onKnowItPass(p, now);
    await Q.openMission(db, profileId, conceptId, now);
    return finish(db, profileId, p, res, now, { missionOpened: true });
  }
  return finish(db, profileId, p, M.onKnowItFail(p, now), now);
}

/** Case solved: every concept the case lists becomes Mastered. */
export async function caseSolved(db: Db, profileId: string, c: CaseFile, now = nowIso()): Promise<Outcome[]> {
  const out: Outcome[] = [];
  for (const id of c.concepts) {
    const p = await load(db, profileId, id);
    out.push(await finish(db, profileId, p, M.onCaseSolved(p), now));
  }
  return out;
}

/** A case unlocks when every concept in its needs list is at least Explained. */
export function caseUnlocked(c: CaseFile, progress: ConceptProgress[]): boolean {
  return c.needs.every((id) => (progress.find((p) => p.conceptId === id)?.level ?? 0) >= 3);
}
