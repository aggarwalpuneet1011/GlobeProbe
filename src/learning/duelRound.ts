// Pair Duel round rules: 8 items from one deck, shuffled. A wrong item comes back once at the end of the round.
import type { DuelDeck, DuelItem } from '../types';
import { shuffle, type Rng } from '../util/rng';

export const ROUND_SIZE = 8;
export interface DuelState {
  items: DuelItem[];
  queue: string[];                          // ids still to ask, front first
  firstTry: Record<string, boolean>;        // result of the first answer for each item
  requeued: string[];                       // items already given their second chance
}

export function duelStart(deck: DuelDeck, rng: Rng = Math.random, size = ROUND_SIZE): DuelState {
  const items = shuffle(deck.items, rng).slice(0, size);
  return { items, queue: items.map((i) => i.id), firstTry: {}, requeued: [] };
}
export const duelCurrent = (s: DuelState): DuelItem | null => (s.queue.length ? s.items.find((i) => i.id === s.queue[0]) ?? null : null);
export const duelDone = (s: DuelState) => s.queue.length === 0;

/** Applies the answer to the front item. Right: it leaves the queue. Wrong: it goes to the back once, then leaves for good. */
export function duelAnswer(s: DuelState, correct: boolean): DuelState {
  if (!s.queue.length) return s;
  const id = s.queue[0];
  const firstTry = id in s.firstTry ? s.firstTry : { ...s.firstTry, [id]: correct };
  const rest = s.queue.slice(1);
  if (correct || s.requeued.includes(id)) return { ...s, queue: rest, firstTry };
  return { ...s, queue: [...rest, id], firstTry, requeued: [...s.requeued, id] };
}
export function duelSummary(s: DuelState): { right: number; total: number; missed: DuelItem[] } {
  const missed = s.items.filter((i) => s.firstTry[i.id] === false);
  return { right: s.items.length - missed.length, total: s.items.length, missed };
}
