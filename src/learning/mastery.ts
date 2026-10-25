// Mastery levels. Pure functions: no I/O, fully testable.
import type { ConceptProgress, ExampleKind, Level } from '../types';
import { istDayDiff } from '../util/time';

export function newProgress(conceptId: ConceptProgress['conceptId']): ConceptProgress {
  return {
    conceptId, level: 0, stopStep: 0, explainCorrectCount: 0, lastExplainExample: null, lastExplainAt: null,
    twistPassed: false, knowItLastTry: null, lastSeenAt: null, startedAt: null, finishedAt: null,
  };
}

export interface LevelChange { from: Level; to: Level }
export interface Result { progress: ConceptProgress; change: LevelChange | null }

const wrap = (before: ConceptProgress, after: ConceptProgress): Result => ({
  progress: after,
  change: after.level !== before.level ? { from: before.level, to: after.level } : null,
});
const raise = (p: ConceptProgress, to: Level): ConceptProgress => (p.level >= to ? p : { ...p, level: to });

export const isFinished = (p: ConceptProgress) => p.stopStep >= 6;

/** Level 1 "Noticed": finished the Watch step of the Stop once. */
export function onWatchDone(p: ConceptProgress): Result {
  return wrap(p, raise(p, 1));
}

/** Level 2 "Named": 2 correct naming answers in a row (Stop step 5 or a Duel item). Caller supplies the streak including this answer. */
export function onNameAnswer(p: ConceptProgress, streakAfter: number): Result {
  return wrap(p, streakAfter >= 2 ? raise(p, 2) : p);
}

export interface ExplainInput { correct: boolean; firstTry: boolean; withHelp: boolean; example: ExampleKind; now: string }

/**
 * Level 3 "Explained": correct Explain (first try, no hint) on 2 separate occasions, at least 1 day apart
 * OR on two different examples. The first happens in the Stop; the second comes from a review.
 */
export function onExplain(p: ConceptProgress, e: ExplainInput): Result {
  if (!e.correct || !e.firstTry || e.withHelp) return wrap(p, p);
  if (p.explainCorrectCount === 0 || !p.lastExplainAt) {
    return wrap(p, { ...p, explainCorrectCount: 1, lastExplainExample: e.example, lastExplainAt: e.now });
  }
  const dayApart = istDayDiff(p.lastExplainAt, e.now) >= 1;
  const differentExample = p.lastExplainExample !== e.example;
  if (dayApart || differentExample) {
    const next = { ...p, explainCorrectCount: p.explainCorrectCount + 1, lastExplainExample: e.example, lastExplainAt: e.now };
    return wrap(p, raise(next, 3));
  }
  return wrap(p, p); // same day, same example: not a separate occasion
}

/** Level 4 "Mastered" via the Twist item (first try). No other precondition is needed; the app only offers the Twist for Explained concepts. */
export function onTwist(p: ConceptProgress, correct: boolean, firstTry: boolean): Result {
  if (!(correct && firstTry)) return wrap(p, p);
  return wrap(p, raise({ ...p, twistPassed: true }, 4));
}

export function onCaseSolved(p: ConceptProgress): Result {
  return wrap(p, raise(p, 4));
}

/** "I know this!" 3/3 first-try: straight to Mastered, and the Stop counts as finished so dependants unlock. */
export function onKnowItPass(p: ConceptProgress, now: string): Result {
  const next: ConceptProgress = { ...p, level: 4, stopStep: 6, knowItLastTry: now, startedAt: p.startedAt ?? now, finishedAt: p.finishedAt ?? now };
  return wrap(p, next);
}

export function onKnowItFail(p: ConceptProgress, now: string): Result {
  return wrap(p, { ...p, knowItLastTry: now });
}

/** A wrong answer in a review drops Mastered to Explained, or Explained to Named. Never below Named (level 2). */
export function onReviewWrong(p: ConceptProgress): Result {
  if (p.level === 4) return wrap(p, { ...p, level: 3 });
  if (p.level === 3) return wrap(p, { ...p, level: 2 });
  return wrap(p, p);
}

export function knowItAllowed(p: ConceptProgress, now: string): boolean {
  return !p.knowItLastTry || istDayDiff(p.knowItLastTry, now) >= 1;
}

/** Trailing run of correct naming answers (Stop step 5 + Duel items), newest last. */
export function trailingCorrect(results: boolean[]): number {
  let n = 0;
  for (let i = results.length - 1; i >= 0 && results[i]; i--) n++;
  return n;
}
