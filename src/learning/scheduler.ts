// Spaced reviews. Intervals 1, 3, 7, 14, 30 days, then every 30. Correct = next interval, wrong = back to 1.
import type { Concept, ConceptId, ConceptProgress, DuelDeck, ExampleKind, ReviewKind, ReviewState } from '../types';
import { istStartOfDayIso } from '../util/time';
import type { Rng } from '../util/rng';

export const INTERVALS = [1, 3, 7, 14, 30] as const;
export const MAX_WARMUP = 2;
export const EXAMPLE_ROTATION: ExampleKind[] = ['home', 'india', 'world'];
/** The Stop's own Explain question uses the "home" framing, so the first review shows a different one. */
export const STOP_EXAMPLE: ExampleKind = 'home';

export function nextInterval(current: number): number {
  const i = INTERVALS.findIndex((x) => x === current);
  if (i < 0) return INTERVALS[0];
  return INTERVALS[Math.min(i + 1, INTERVALS.length - 1)];
}

/** Dues fall at the start of an IST day so "tomorrow" means tomorrow morning, not 24 h later. */
export const dueAtFor = (now: string, intervalDays: number) => istStartOfDayIso(now, intervalDays);

/** A review schedule exists as soon as a concept is Named (level 2) or better. Returns the new row or null when nothing to add. */
export function ensureReview(existing: ReviewState | undefined, p: ConceptProgress, now: string): ReviewState | null {
  if (existing || p.level < 2) return null;
  return { conceptId: p.conceptId, intervalDays: 1, dueAt: dueAtFor(now, 1) };
}

export function afterReview(r: ReviewState, correct: boolean, now: string): ReviewState {
  const intervalDays = correct ? nextInterval(r.intervalDays) : 1;
  return { conceptId: r.conceptId, intervalDays, dueAt: dueAtFor(now, intervalDays) };
}

/** Up to `max` due reviews, oldest due first, for the Warm-up. */
export function dueReviews(reviews: ReviewState[], progress: ConceptProgress[], now: string, max = MAX_WARMUP): ReviewState[] {
  const level = new Map<ConceptId, number>(progress.map((p) => [p.conceptId, p.level]));
  const t = Date.parse(now);
  return reviews
    .filter((r) => Date.parse(r.dueAt) <= t && (level.get(r.conceptId) ?? 0) >= 2)
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt) || a.conceptId.localeCompare(b.conceptId))
    .slice(0, max);
}

export type ReviewItem =
  | { kind: 'explain'; conceptId: ConceptId; example: ExampleKind }
  | { kind: 'duel'; conceptId: ConceptId; itemId: string }
  | { kind: 'name'; conceptId: ConceptId; index: number };

export function nextExample(last: ExampleKind | null): ExampleKind {
  const i = last ? EXAMPLE_ROTATION.indexOf(last) : EXAMPLE_ROTATION.indexOf(STOP_EXAMPLE);
  return EXAMPLE_ROTATION[(i + 1) % EXAMPLE_ROTATION.length];
}

/**
 * Order: (a) the Explain question with a different example from last time, (b) a Duel item, (c) the Name-it item.
 * (a) is available for every concept, so (b) and (c) are the fallbacks if a concept's Explain content is ever missing.
 */
export function chooseReviewItem(concept: Concept, deck: DuelDeck | undefined, p: ConceptProgress, rng: Rng, lastKind: ReviewKind | null = null): ReviewItem {
  const hasExplain = !!concept.explain && concept.explain.misconceptions.length >= 2;
  if (hasExplain) return { kind: 'explain', conceptId: concept.id, example: nextExample(p.lastExplainExample) };
  const items = deck?.items.filter((i) => !i.concept || i.concept === concept.id) ?? [];
  if (items.length) return { kind: 'duel', conceptId: concept.id, itemId: items[Math.floor(rng() * items.length)].id };
  return { kind: 'name', conceptId: concept.id, index: Math.floor(rng() * Math.max(1, concept.nameIt.length)) };
}
