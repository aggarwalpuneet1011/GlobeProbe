import { test, ok, eq, done } from './harness';
import { duelStart, duelAnswer, duelCurrent, duelDone, duelSummary } from '@/learning/duelRound';
import { DECKS } from '@/content';
import { mulberry32 } from '@/util/rng';

test('a round is 8 distinct items from the deck', () => {
  for (const d of DECKS) { const s = duelStart(d, mulberry32(3)); eq(s.items.length, Math.min(8, d.items.length)); eq(new Set(s.queue).size, s.items.length); }
});
test('all right on the first try: 8 of 8, queue empties', () => {
  let s = duelStart(DECKS[0], mulberry32(1)); let n = 0;
  while (!duelDone(s)) { s = duelAnswer(s, true); n++; }
  eq(n, s.items.length); const r = duelSummary(s); eq(r.right, r.total); eq(r.missed.length, 0);
});
test('a wrong item returns once at the end, and a second miss does not loop forever', () => {
  let s = duelStart(DECKS[0], mulberry32(2)); const first = duelCurrent(s)!.id;
  s = duelAnswer(s, false);
  eq(s.queue[s.queue.length - 1], first); eq(s.queue.length, s.items.length);
  let guard = 0;
  while (!duelDone(s) && guard++ < 50) s = duelAnswer(s, duelCurrent(s)!.id !== first ? true : false);
  ok(duelDone(s), 'finished'); const r = duelSummary(s);
  eq(r.right, r.total - 1); eq(r.missed[0].id, first);
});
test('right answer on the re-ask keeps the first-try miss', () => {
  let s = duelStart(DECKS[1], mulberry32(4)); const id = duelCurrent(s)!.id;
  s = duelAnswer(s, false);
  while (!duelDone(s)) s = duelAnswer(s, true);
  eq(duelSummary(s).missed.map((i) => i.id), [id]);
});
done();
