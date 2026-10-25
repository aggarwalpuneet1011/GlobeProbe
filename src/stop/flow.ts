// Pure logic for the Stop screen. No React or native imports so it runs under node tests.
import type { Concept, ChoiceOption, NameItItem } from '../types';
import { shuffle, pickNoRepeat, type Rng } from '../util/rng';
import { FEEDBACK } from '../content/copy';

export interface ExplainOption { id: string; text: string; misconceptionId: string | null }

/** 1 correct + 2 misconceptions drawn at random from the pool, in random order. */
export function buildExplainOptions(concept: Concept, rng: Rng = Math.random): ExplainOption[] {
  const { correct, misconceptions } = concept.explain;
  const wrong = shuffle(misconceptions, rng).slice(0, 2).map((m) => ({ id: m.id, text: m.text, misconceptionId: m.id }));
  return shuffle([{ id: correct.id, text: correct.text, misconceptionId: null }, ...wrong], rng);
}

/** Same options, new order (re-ask after a wrong first try). Never returns the identical order when it can be avoided. */
export function reshuffle<T extends { id: string }>(prev: readonly T[], rng: Rng = Math.random): T[] {
  if (prev.length < 2) return prev.slice();
  for (let i = 0; i < 8; i++) {
    const next = shuffle(prev, rng);
    if (next.some((o, k) => o.id !== prev[k].id)) return next;
  }
  return [...prev.slice(1), prev[0]];
}

export type ExplainVerdict =
  | { action: 'correct'; countsToward: boolean; feedback: 'first' | 'second' }
  | { action: 'replay' }          // first wrong try: highlight replay, then re-ask
  | { action: 'reveal' };         // second wrong try: show the right card and move on

export function judgeExplain(tries: number, correct: boolean, withHelp: boolean): ExplainVerdict {
  if (correct) return { action: 'correct', countsToward: tries === 0 && !withHelp, feedback: tries === 0 ? 'first' : 'second' };
  return tries === 0 ? { action: 'replay' } : { action: 'reveal' };
}

/** What Bindu says once the Watch run ends. Predict has no wrong answer. */
export function predictReveal(concept: Concept, choiceId: string | null, rng: Rng = Math.random, last: string | null = null): { matched: boolean; text: string } {
  if (!choiceId) return { matched: false, text: concept.watch.revealMiss ?? '' };
  const opt = concept.predict.options.find((o) => o.id === choiceId);
  const short = opt?.short ?? opt?.text.toLowerCase() ?? 'that';
  const matched = choiceId === concept.predict.answer;
  if (matched) return { matched, text: concept.watch.revealMatch ?? FEEDBACK.predictMatch.replace('{choice}', short) };
  const lead = `You predicted ${short}.`;
  if (concept.watch.revealMiss) return { matched, text: `${lead} ${concept.watch.revealMiss}` };
  return { matched, text: pickNoRepeat(FEEDBACK.predictMiss, last, rng).replace('{choice}', short) };
}

export interface NameQuestion { item: NameItItem; options: { text: string; icon?: string }[]; answer: number }

/** Shuffles each item's options and tracks where the right one went. wind_game items keep their empty option list. */
export function buildNameQuestions(items: NameItItem[], rng: Rng = Math.random): NameQuestion[] {
  return items.map((item) => {
    if (item.kind === 'wind_game') return { item, options: [], answer: -1 };
    const idx = shuffle(item.options.map((_, i) => i), rng);
    return {
      item,
      options: idx.map((i) => ({ text: item.options[i], icon: item.optionIcons?.[i] })),
      answer: idx.indexOf(item.answer),
    };
  });
}

/** Twist / predict options shuffled with the right id kept. */
export function shuffleOptions(options: ChoiceOption[], rng: Rng = Math.random): ChoiceOption[] {
  return shuffle(options, rng);
}

/** Which step the Stop opens at. Replay and finished Stops start at 1; a started Stop resumes at the next unfinished step. */
export function startStepFor(stopStep: number, mode: string | undefined): number {
  if (mode === 'replay' || stopStep >= 6) return 1;
  return Math.min(Math.max(stopStep + 1, 1), 6);
}

/** Stamp step content. */
export type StampKind = 'full' | 'half' | 'spotted';
export function stampKind(level: number, halfStamp: boolean): StampKind {
  if (level >= 3) return 'full';
  return halfStamp ? 'half' : 'spotted';
}
