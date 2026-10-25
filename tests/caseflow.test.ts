import { test, ok, eq, done } from './harness';
import { shuffledCase, correctSlots, judgeBuild, judgeSpoken, verdictLines, canUseAi } from '@/case/flow';
import { CASES } from '@/content';
import { mulberry32 } from '@/util/rng';

test('shuffled case keeps every answer id valid and the same option sets', () => {
  for (const c of CASES) for (let s = 1; s <= 10; s++) {
    const x = shuffledCase(c, mulberry32(s));
    eq(x.questions.length, c.questions.length);
    x.questions.forEach((q) => { ok(q.options.some((o) => o.id === q.answer), c.id + ' q answer'); });
    ok(x.twist.options.some((o) => o.id === x.twist.answer), c.id + ' twist');
    x.bigWhy.chips.forEach((ch, i) => { ok(ch.options.some((o) => o.id === ch.answer), c.id + ' chip'); eq(ch.options.map((o) => o.id).sort().join(), c.bigWhy.chips[i].options.map((o) => o.id).sort().join()); });
  }
});
test('Build-it: 3 right = solved (with twist), 2 = almost, <=1 = not yet; missed twist caps at almost', () => {
  const c = CASES[0]; const right = c.bigWhy.chips.map((s) => s.answer);
  eq(judgeBuild(c, right, true).verdict, 'solved'); eq(judgeBuild(c, right, false).verdict, 'almost');
  eq(judgeBuild(c, [right[0], right[1], 'zz'], true).verdict, 'almost');
  eq(judgeBuild(c, [right[0], 'zz', 'zz'], true).verdict, 'not_yet'); eq(judgeBuild(c, [null, null, null], true).verdict, 'not_yet');
  eq(correctSlots(c, right), 3);
  ok(judgeBuild(c, [right[0], 'zz', right[2]], true).missed !== null, 'names one missing idea');
});
test('spoken: verdict is computed from ids, unknown ids dropped, misconception blocks solved', () => {
  const c = CASES[0]; const req = c.bigWhy.keyIdeas.filter((k) => k.required).map((k) => k.id);
  eq(judgeSpoken(c, req, [], true).verdict, 'solved');
  eq(judgeSpoken(c, req, ['m_wall'], true).verdict, 'almost');
  eq(judgeSpoken(c, ['nope', 'k99'], [], true).verdict, 'not_yet');
  eq(judgeSpoken(c, [req[0]], [], true).verdict, 'almost');
  eq(judgeSpoken(c, req, [], false).verdict, 'almost');
});
test('verdict lines never say wrong', () => {
  for (const c of CASES) for (const v of [judgeBuild(c, [null, null, null], true), judgeBuild(c, c.bigWhy.chips.map((s) => s.answer), true), judgeBuild(c, [c.bigWhy.chips[0].answer, null, null], false)]) {
    const l = verdictLines(v);
    ok(!/\bwrong\b/i.test(`${l.headline} ${l.detail ?? ''}`), 'tone');
  }
  ok(canUseAi(true, null) && !canUseAi(false, true) && !canUseAi(true, false), 'ai gate');
});
done();
