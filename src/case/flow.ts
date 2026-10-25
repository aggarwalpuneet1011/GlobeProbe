// Case File rules that need no UI: shuffling for retries, Build-it scoring, and the words under each verdict.
import type { CaseFile, CaseQuestion } from '../types';
import { shuffle, type Rng } from '../util/rng';
import { chipVerdict, computeVerdict, type Verdict } from '../ai/verdict';
import { FEEDBACK } from '../content/copy';

/** The same case with question options, twist options and chip options in a new order (shown on a retry). */
export function shuffledCase(c: CaseFile, rng: Rng = Math.random): CaseFile {
  const q = (x: CaseQuestion): CaseQuestion => ({ ...x, options: shuffle(x.options, rng) });
  return {
    ...c,
    questions: shuffle(c.questions, rng).map(q),
    twist: { ...c.twist, options: shuffle(c.twist.options, rng) },
    bigWhy: { ...c.bigWhy, chips: c.bigWhy.chips.map((s) => ({ ...s, options: shuffle(s.options, rng) })) },
  };
}

export function correctSlots(c: CaseFile, picks: (string | null)[]): number {
  return c.bigWhy.chips.reduce((n, s, i) => n + (picks[i] === s.answer ? 1 : 0), 0);
}

export interface Judged { verdict: Verdict; found: number; required: number; missed: string | null }

/** Build-it: all 3 slots correct = every required idea found. */
export function judgeBuild(c: CaseFile, picks: (string | null)[], twistCorrect: boolean): Judged {
  const n = correctSlots(c, picks);
  const required = c.bigWhy.keyIdeas.filter((k) => k.required);
  const found = n >= 3 ? required.length : n === 2 ? Math.max(1, required.length - 1) : n === 1 ? 1 : 0;
  const idx = c.bigWhy.chips.findIndex((s, i) => picks[i] !== s.answer);
  const missedIdea = n >= 3 ? null : (required[Math.min(Math.max(idx, 0), required.length - 1)]?.text ?? null);
  return { verdict: chipVerdict(n, twistCorrect), found, required: required.length, missed: missedIdea };
}

/** Gemini: the verdict comes from code over the ideas the model reported. */
export function judgeSpoken(c: CaseFile, ideasFound: string[], misconceptionsFound: string[], twistCorrect: boolean): Judged {
  const ids = new Set(c.bigWhy.keyIdeas.map((k) => k.id));
  const required = c.bigWhy.keyIdeas.filter((k) => k.required);
  const have = new Set(ideasFound.filter((i) => ids.has(i)));
  const miss = required.find((k) => !have.has(k.id));
  return {
    verdict: computeVerdict(c.bigWhy.keyIdeas, ideasFound, misconceptionsFound, twistCorrect),
    found: required.filter((k) => have.has(k.id)).length, required: required.length, missed: miss?.text ?? null,
  };
}

/** Bindu's lines under the verdict. `aiFeedback` replaces the generic line when Gemini wrote one. */
export function verdictLines(j: Judged, aiFeedback?: string | null): { headline: string; detail: string | null } {
  if (j.verdict === 'solved') return { headline: FEEDBACK.caseSolved, detail: aiFeedback ?? null };
  if (j.verdict === 'almost') {
    return { headline: FEEDBACK.caseAlmost.replace('{n}', String(j.found)), detail: aiFeedback ?? j.missed };
  }
  return { headline: FEEDBACK.caseNotYet, detail: aiFeedback ?? null };
}

/** Case answered in `mode`: the child text for each Big Why path when AI is unavailable falls back to Build-it. */
export const canUseAi = (hasKey: boolean, online: boolean | null) => hasKey && online !== false;
