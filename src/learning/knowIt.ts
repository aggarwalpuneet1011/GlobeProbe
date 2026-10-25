// "I know this!": 3 items, all first-try correct. Explain (world example), the Twist, one Duel item.
import type { Concept, ConceptId, DuelDeck } from '../types';
import type { Rng } from '../util/rng';

export type KnowItItem =
  | { kind: 'explain'; example: 'world' }
  | { kind: 'twist' }
  | { kind: 'duel'; itemId: string }
  | { kind: 'name'; index: number };   // fallback when the concept has no Duel deck (only 6 decks exist for 8 concepts)

export function knowItItems(concept: Concept, deck: DuelDeck | undefined, rng: Rng): KnowItItem[] {
  const pool = deck?.items.filter((i) => !i.concept || i.concept === concept.id) ?? [];
  const third: KnowItItem = pool.length
    ? { kind: 'duel', itemId: pool[Math.floor(rng() * pool.length)].id }
    : { kind: 'name', index: Math.max(0, concept.nameIt.findIndex((n) => n.kind !== 'wind_game')) };
  return [{ kind: 'explain', example: 'world' }, { kind: 'twist' }, third];
}

export type KnowItState = 'pending' | 'pass' | 'fail';

/** Any miss fails immediately; 3 first-try correct answers pass. */
export function knowItState(firstTryResults: boolean[]): KnowItState {
  if (firstTryResults.some((r) => !r)) return 'fail';
  return firstTryResults.length >= 3 ? 'pass' : 'pending';
}

