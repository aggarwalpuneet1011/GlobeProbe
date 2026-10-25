import { test, ok, eq, done } from './harness';
import { buildExplainOptions, reshuffle, judgeExplain, predictReveal, buildNameQuestions, startStepFor, stampKind } from '@/stop/flow';
import { CONCEPTS, getConcept } from '@/content';
import { mulberry32 } from '@/util/rng';
import { terrainRgb, LAND_COLOURS, HM_FLOOR } from '@/three/heightmap';
import { knowItItems } from '@/learning/knowIt';
import { deckForConcept } from '@/content';

test('Explain set: 3 options, exactly one correct, 2 distinct misconceptions from the pool', () => {
  for (const c of CONCEPTS) for (let s = 1; s <= 30; s++) {
    const o = buildExplainOptions(c, mulberry32(s));
    eq(o.length, 3);
    eq(o.filter((x) => x.misconceptionId === null).length, 1);
    eq(new Set(o.map((x) => x.id)).size, 3);
    ok(o.every((x) => x.misconceptionId === null || c.explain.misconceptions.some((m) => m.id === x.misconceptionId)), 'pool');
  }
});
test('Explain set: correct card lands in every position and every misconception gets drawn', () => {
  const c = getConcept('C01'); const pos = new Set<number>(); const seen = new Set<string>();
  for (let s = 1; s <= 200; s++) { const o = buildExplainOptions(c, mulberry32(s)); pos.add(o.findIndex((x) => x.misconceptionId === null)); o.forEach((x) => x.misconceptionId && seen.add(x.misconceptionId)); }
  eq(pos.size, 3); eq(seen.size, c.explain.misconceptions.length);
});
test('reshuffle changes the order but keeps the same cards', () => {
  const c = getConcept('C03'); const o = buildExplainOptions(c, mulberry32(7));
  for (let s = 1; s <= 40; s++) {
    const r = reshuffle(o, mulberry32(s));
    eq(r.map((x) => x.id).sort().join(), o.map((x) => x.id).sort().join());
    ok(r.some((x, i) => x.id !== o[i].id), 'order differs');
  }
});
test('judgeExplain follows the explain rules', () => {
  eq(judgeExplain(0, true, false), { action: 'correct', countsToward: true, feedback: 'first' });
  eq(judgeExplain(0, true, true), { action: 'correct', countsToward: false, feedback: 'first' });
  eq(judgeExplain(1, true, false), { action: 'correct', countsToward: false, feedback: 'second' });
  eq(judgeExplain(0, false, false), { action: 'replay' });
  eq(judgeExplain(1, false, false), { action: 'reveal' });
});
test('predictReveal: match and miss wording, never "wrong"', () => {
  for (const c of CONCEPTS) {
    const hit = predictReveal(c, c.predict.answer);
    ok(hit.matched && hit.text.length > 0, c.id + ' match');
    for (const o of c.predict.options.filter((x) => x.id !== c.predict.answer)) {
      const m = predictReveal(c, o.id, mulberry32(3));
      ok(!m.matched && m.text.length > 0, c.id + ' miss');
      ok(!/\b(wrong|incorrect|bad|no)\b/i.test(m.text), c.id + ' tone: ' + m.text);
    }
  }
});
test('Name-it questions keep the right answer after shuffling', () => {
  for (const c of CONCEPTS) for (let s = 1; s <= 20; s++) {
    const qs = buildNameQuestions(c.nameIt, mulberry32(s));
    qs.forEach((q) => {
      if (q.item.kind === 'wind_game') { eq(q.answer, -1); return; }
      eq(q.options[q.answer].text, q.item.options[q.item.answer]);
      if (q.item.optionIcons) eq(q.options[q.answer].icon, q.item.optionIcons[q.item.answer]);
    });
  }
});
test('start step and stamp kind', () => {
  eq(startStepFor(0, undefined), 1); eq(startStepFor(3, undefined), 4); eq(startStepFor(5, undefined), 6);
  eq(startStepFor(6, undefined), 1); eq(startStepFor(4, 'replay'), 1);
  eq(stampKind(3, false), 'full'); eq(stampKind(4, true), 'full'); eq(stampKind(2, true), 'half'); eq(stampKind(1, false), 'spotted');
});
test('terrain colours: bands above the sea, depth shading below', () => {
  eq(terrainRgb(0.02, -0.2), LAND_COLOURS.sand); eq(terrainRgb(0.3, -0.2), LAND_COLOURS.green); eq(terrainRgb(0.9, -0.2), LAND_COLOURS.stone);
  const shallow = terrainRgb(0.0, 0.05); const deep = terrainRgb(HM_FLOOR, 0.05);
  ok(deep[0] < shallow[0] && deep[2] <= shallow[2] + 0.2, 'deeper is darker');
});
test('I know this: three items for every concept, duel falls back to Name-it when there is no deck', () => {
  for (const c of CONCEPTS) {
    const it = knowItItems(c, deckForConcept(c.id), mulberry32(5));
    eq(it.length, 3); eq(it[0].kind, 'explain'); eq(it[1].kind, 'twist');
    const third = it[2];
    if (deckForConcept(c.id)) eq(third.kind, 'duel');
    else { eq(third.kind, 'name'); if (third.kind === 'name') ok(c.nameIt[third.index].kind !== 'wind_game', c.id + ' name item usable'); }
  }
});
done();
