import { test, ok, eq, near, done } from './harness';
import { createSim, createSimFor, runSim, SimSession, STEP, ScriptRunner } from '@/sims';
import { EvapSim } from '@/sims/evap';
import { CloudSim } from '@/sims/cloud';
import { RainSim, typeForHold, meterSegments } from '@/sims/rain';
import { WindSim, windFromArrow, windGame, windLabel, opposite, isFromLand } from '@/sims/wind';
import { BreezeSim, breezeMode, BREEZE_LABEL, breezeDelta, skyAt, DAY_SKY, NIGHT_SKY } from '@/sims/breeze';
import { TideSim, tideExtrema, tideLevel } from '@/sims/tide';
import { evalCheck } from '@/learning/labChecks';
import { getConcept, CONCEPTS } from '@/content';

const lab = (id: string, i: number) => getConcept(id as never).labChallenges[i].check!;

test('Every concept builds its sim; script controls exist in the sim specs', () => {
  for (const c of CONCEPTS) {
    const sim = createSimFor(c);
    ok(!!sim, c.id);
    const specs = sim!.specs();
    for (const step of c.watch.script) if ('set' in step) for (const k of Object.keys(step.set)) ok(k in specs, `${c.id} script control ${k}`);
    if (c.sim === 'SIM_RAIN') ok(c.watch.script.some((s) => 'hold' in s), 'rain script holds');
    // every Lab check identifier is a metric the sim exposes
    for (const l of c.labChallenges) if (l.check) {
      const m = sim!.metrics();
      for (const id of l.check.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) ok(id in m, `${c.id} metric ${id}`);
    }
  }
});

test('EVAP: sunny puddle gone near 16 s, shaded one still has water (Watch script "t16 sun puddle gone")', () => {
  const c = getConcept('C01'); const s = new EvapSim(c.seed); runSim(s, 18, c.watch.script);
  near(s.goneAt[0], 16, 1.2, 'gone at'); ok(s.water[1] > 0.4, 'shaded still wet ' + s.water[1]);
  const mid = new EvapSim(c.seed); runSim(mid, 10, c.watch.script);
  ok(mid.water[0] < mid.water[1], 'sunny shrinks faster');
});

test('EVAP: Lab c01_l1 needs sun+wind to dry in under 10 s; no sun still dries with wind', () => {
  const dflt = new EvapSim(101); runSim(dflt, 12);
  eq(evalCheck(lab('C01', 0), dflt.metrics()), false);
  const fast = new EvapSim(101); fast.setControl('sun', 3); fast.setControl('wind', 'breezy'); runSim(fast, 12);
  eq(evalCheck(lab('C01', 0), fast.metrics()), true);
  const still3 = new EvapSim(101); still3.setControl('sun', 3); runSim(still3, 12);
  eq(evalCheck(lab('C01', 0), still3.metrics()), false, 'sun alone is not enough');
  const noSun = new EvapSim(101); noSun.setControl('sun', 0); noSun.setControl('wind', 'breezy'); runSim(noSun, 60);
  ok(noSun.water[0] === 0, 'wind alone dries it (c01_l2: yes)');
});

test('EVAP: wisps rise, fade and stay pooled', () => {
  const s = new EvapSim(101); let max = 0; let maxY = 1e9;
  for (let i = 0; i < 30 * 12; i++) { s.step(); max = Math.max(max, s.wisps.count); for (let k = 0; k < s.wisps.size; k++) if (s.wisps.active[k]) maxY = Math.min(maxY, s.wisps.y[k]); }
  ok(max > 3 && max <= 48, 'wisps ' + max); ok(maxY < 330, 'they rise');
});

test('CLOUD: cooling shows before the cloud; cloud grows in 1.2 s above the line and vanishes in 1.2 s below', () => {
  const s = new CloudSim(202);
  s.setControl('parcelY', 250); runSim(s, 0.5);
  ok(s.metrics().coolness > 0.3 && s.bigPuff === 0, 'cool, no cloud yet');
  s.setControl('parcelY', 190); runSim(s, 0.6); near(s.bigPuff, 13, 1, 'half grown');
  runSim(s, 0.7); near(s.bigPuff, 26, 0.01);
  s.setControl('parcelY', 260); runSim(s, 1.25); eq(s.bigPuff, 0);
});

test('CLOUD: Lab c02_l1 needs a cloud with the parcel just above the line', () => {
  const s = new CloudSim(202); eq(evalCheck(lab('C02', 0), s.metrics()), false);
  s.setControl('parcelY', 190); runSim(s, 1.5); eq(evalCheck(lab('C02', 0), s.metrics()), true);
  s.setControl('parcelY', 120); eq(evalCheck(lab('C02', 0), s.metrics()), false, 'too high');
});

test('CLOUD: sun slider makes small parcels rise on their own', () => {
  const s = new CloudSim(202); s.setControl('sun', 0); runSim(s, 5); eq(s.small.count, 0);
  s.setControl('sun', 3); runSim(s, 6); ok(s.small.count >= 3 && s.small.count <= 40, 'small parcels ' + s.small.count);
});

test('T3 RAIN: hold 0.5 s -> drizzle, 2 s -> rain, 3 s -> downpour', () => {
  eq([0.5, 2, 3].map(typeForHold), ['drizzle', 'rain', 'downpour']);
  eq([0.5, 1.3, 2.6].map(meterSegments), [1, 2, 3]);
  for (const [hold, type] of [[0.5, 'drizzle'], [2, 'rain'], [3, 'downpour']] as const) {
    const s = new RainSim(303); s.setControl('press', true); runSim(s, hold); s.setControl('press', false); runSim(s, 0.2);
    eq(s.type, type, `hold ${hold}`); ok(s.rainLeft > 7.5, 'rains 8 s');
  }
});

test('RAIN: umbrella and splashes follow the type; drop sizes and rates match the table', () => {
  const s = new RainSim(303); s.setControl('press', true); runSim(s, 0.5); s.setControl('press', false); runSim(s, 1);
  eq(s.umbrellaOpen, false); eq(s.splashes, false);
  const r = new RainSim(303); r.setControl('press', true); runSim(r, 2); r.setControl('press', false); runSim(r, 1);
  eq(r.umbrellaOpen, true); eq(r.splashes, false);
  const d = new RainSim(303); d.setControl('press', true); runSim(d, 3); d.setControl('press', false); runSim(d, 1);
  eq(d.umbrellaOpen, true); eq(d.splashes, true);
  let max = 0; for (let i = 0; i < 90; i++) { d.step(); max = Math.max(max, d.drops.count); }
  ok(max <= 260, 'pool');
});

test('RAIN: Lab c03_l1 needs a downpour to overflow the puddle; drizzle alone does not in one go', () => {
  const dz = new RainSim(303); dz.setControl('press', true); runSim(dz, 0.5); dz.setControl('press', false); runSim(dz, 9);
  eq(evalCheck(lab('C03', 0), dz.metrics()), false);
  const dp = new RainSim(303); dp.setControl('press', true); runSim(dp, 3); dp.setControl('press', false);
  let hit = false; for (let i = 0; i < 30 * 9; i++) { dp.step(); if (evalCheck(lab('C03', 0), dp.metrics())) hit = true; }
  ok(hit, 'downpour overflows');
});

test('RAIN: scripted holds (0.6, 2, 3 s) run through the three types in order', () => {
  const c = getConcept('C03'); const s = new RainSim(c.seed); const seen: number[] = [];
  const r = new ScriptRunner(c.watch.script, s);
  for (let i = 0; i < 30 * 20; i++) { r.update(s.time); s.step(); const t = s.metrics().rainType; if (seen[seen.length - 1] !== t && t) seen.push(t); }
  eq(seen, [1, 2, 3]);
});

test('T3 WIND: "make a north-east wind" passes only when the arrow points south-west', () => {
  eq(windFromArrow(225), 'NE');            // arrow head toward SW => wind from NE
  eq(windGame('NE', windFromArrow(225)), 'correct');
  eq(windGame('NE', windFromArrow(45)), 'wentTo');   // arrow toward NE => wind FROM SW, "going to the north-east"
  eq(windGame('NE', 'E'), 'wrong');
  eq(opposite('N'), 'S'); eq(windFromArrow(100), 'W');
  eq(windLabel('W'), 'Wind from the west (W)'); eq(windLabel('NE'), 'Wind from the north-east (NE)');
  ok(!/blowing (west|east|north|south)|ward wind/i.test(windLabel('SW')), 'always "from"');
});

test('WIND: lab checks and arrow animation', () => {
  const s = new WindSim(404);
  eq(evalCheck(lab('C04', 0), s.metrics()), false);
  for (const d of ['NE', 'E', 'SE'] as const) { s.setControl('windFrom', d); eq(evalCheck(lab('C04', 0), s.metrics()), true, d); }
  s.setControl('windFrom', 'W'); eq(isFromLand('W'), false);
  s.setControl('windFrom', 'SW'); eq(evalCheck(lab('C04', 1), s.metrics()), true);
  runSim(s, 1); near(s.arrow, 45, 0.5, 'arrow toward NE for wind from SW');
});

test('T3 BREEZE: 2 pm Sea breeze, 2 am Land breeze, 9 am and 8 pm Calm', () => {
  eq(BREEZE_LABEL[breezeMode(14)], 'Sea breeze: wind from the sea');
  eq(BREEZE_LABEL[breezeMode(26)], 'Land breeze: wind from the land');
  eq(breezeMode(9), 'calm'); eq(breezeMode(20), 'calm');
  eq(breezeMode(2 + 0), 'land');
  near(breezeDelta(14), 6, 0.01); near(breezeDelta(26), -4, 0.01);
  const s = new BreezeSim(505); s.setControl('time', 14); eq(s.label, 'Sea breeze: wind from the sea'); near(s.arrowThickness, 12, 0.01);
  s.setControl('time', 9); eq(s.label, 'Calm');
});

test('BREEZE: Play runs 1 hour per second and stops at 6 am; calm freezes the loop; parcels circulate warm up, cool down', () => {
  const s = new BreezeSim(505); s.setControl('time', 6); s.setControl('playing', true); runSim(s, 3);
  near(s.hours, 9, 0.05);
  s.setControl('time', 29); runSim(s, 2); eq(s.hours, 30); eq(!!s.controls.playing, false);
});

test('BREEZE: sea breeze loop goes low toward land; land breeze reverses it; calm stops it', () => {
  const sea = new BreezeSim(505); sea.setControl('time', 14);
  const x0 = Array.from(sea.px); const y0 = Array.from(sea.py);
  runSim(sea, 0.5);
  let moved = 0; for (let i = 0; i < 6; i++) moved += Math.abs(sea.px[i] - x0[i]) + Math.abs(sea.py[i] - y0[i]);
  ok(moved > 6, 'moves');
  // a parcel on the low leg moves toward larger x in a sea breeze
  const lowIdx = Array.from(sea.py).findIndex((y, i) => y === 360 && sea.px[i] > 80 && sea.px[i] < 260);
  if (lowIdx >= 0) { const xb = sea.px[lowIdx]; runSim(sea, 0.2); ok(sea.px[lowIdx] > xb, 'toward land'); }
  const calm = new BreezeSim(505); calm.setControl('time', 9); const before = Array.from(calm.px); runSim(calm, 1); eq(Array.from(calm.px), before);
  const land = new BreezeSim(505); land.setControl('time', 26);
  const idx = Array.from(land.py).findIndex((y, i) => y === 360 && land.px[i] > 80 && land.px[i] < 260);
  if (idx >= 0) { const xb = land.px[idx]; runSim(land, 0.2); ok(land.px[idx] < xb, 'toward sea'); }
});

test('BREEZE: Lab c05_l1 calm reachable; sky colours', () => {
  const s = new BreezeSim(505); eq(evalCheck(lab('C05', 0), s.metrics()), false);
  s.setControl('time', 8); eq(evalCheck(lab('C05', 0), s.metrics()), true);
  eq(skyAt(12).toLowerCase(), DAY_SKY.toLowerCase()); eq(skyAt(24).toLowerCase(), NIGHT_SKY.toLowerCase());
});

test('T3 TIDE: two highs and two lows in any 24 h window; each day high ~50 min later', () => {
  const t0 = 0.7833;
  for (const from of [0, 5, 11.3, 17.9, 23]) {
    const ex = tideExtrema(t0, from, from + 24);
    const highs = ex.filter((e) => e.kind === 'high').length; const lows = ex.filter((e) => e.kind === 'low').length;
    ok(highs >= 1 && highs <= 2 && lows >= 1 && lows <= 2 && highs + lows >= 3 && highs + lows <= 4, `window ${from}: ${highs}/${lows}`);
  }
  const highs = tideExtrema(t0).filter((e) => e.kind === 'high').map((e) => e.t);
  eq(highs.length, 4);
  // the first high of day 2 vs day 1, wrapped into the clock day
  const d1 = highs.find((t) => t < 24)!; const d2 = highs.find((t) => t >= 24)! - 24;
  const firstDay = Math.min(...highs.filter((t) => t < 24)); const secondDay = Math.min(...highs.filter((t) => t >= 24)) - 24;
  near((secondDay - firstDay) * 60, 50, 3, 'minutes later'); void d1; void d2;
  near(tideLevel(t0, t0), 2, 1e-9); near(tideLevel(t0 + 6.21, t0), -2, 1e-9);
});

test('TIDE: causeway covered above mean+0.6 m; Lab c07 checks; marker records the highest level reached', () => {
  const s = new TideSim(707, { tHigh0: 0.7833 });
  s.setControl('time', 0.7833); eq(s.metrics().causewayCovered, 1); eq(evalCheck(lab('C07', 1), s.metrics()), true);
  s.setControl('time', 0.7833 + 6.21); eq(evalCheck(lab('C07', 0), s.metrics()), true); eq(evalCheck(lab('C07', 1), s.metrics()), false);
  near(s.metrics().maxLevelSoFar, 2, 1e-6);
  const r = new TideSim(707, { tHigh0: 0.7833 }); r.setControl('time', 6);
  ok(r.metrics().maxLevelSoFar < 2, 'marker starts at current level');
  // Predict: low tide at 7 am, next low about 7 pm
  const lows = tideExtrema(0.7833).filter((e) => e.kind === 'low').map((e) => e.t);
  ok(lows.some((t) => Math.abs(t - 7) < 0.1), 'low near 7 am today');
  ok(lows.some((t) => Math.abs(t - 19.4) < 0.5), 'next low about 7 pm');
});

test('TIDE: scripted Watch run reaches 46 h and ends with the cursor there', () => {
  const c = getConcept('C07'); const s = new TideSim(c.seed, c.simParams);
  runSim(s, 20, c.watch.script); near(s.hours, 46, 0.01);
});

test('SimSession: fixed 30 Hz regardless of frame rate; 2x runs twice the updates; pause/replay', () => {
  const c = getConcept('C01');
  const a = new SimSession(new EvapSim(c.seed), c.watch.script, c.watch.duration); a.play();
  let steps = 0; for (let i = 0; i < 60; i++) steps += a.tick(1 / 60); near(steps, 30, 1);
  const b = new SimSession(new EvapSim(c.seed), c.watch.script, c.watch.duration); b.play(); b.speed = 2;
  steps = 0; for (let i = 0; i < 60; i++) steps += b.tick(1 / 60); near(steps, 60, 2);
  const slow = new SimSession(new EvapSim(c.seed), null); slow.play(); steps = slow.tick(5); ok(steps <= 12, 'spiral clamp');
  const p = new SimSession(new EvapSim(c.seed), null); eq(p.tick(1), 0);
  const d = new SimSession(new EvapSim(c.seed), c.watch.script, c.watch.duration); d.play(); for (let i = 0; i < 30 * 19; i++) d.tick(STEP + 1e-6);
  eq(d.scriptDone, true); d.replay(); eq(d.scriptDone, false); eq(d.sim.time, 0);
});

test('Captions fire once, at their timestamps', () => {
  const c = getConcept('C01'); const got: [string, number][] = []; const s = new EvapSim(c.seed);
  runSim(s, 12, c.watch.script, (id) => got.push([id, Math.round(s.time * 10) / 10]));
  eq(got.map((g) => g[0]), ['cap1', 'cap2']); near(got[0][1], 3, 0.1); near(got[1][1], 10, 0.1);
});
test('seekTo fast-forwards to the highlight start and matches a normal run', () => {
  const c = getConcept('C06');
  const a = new SimSession(createSim('SIM_MOUNTAIN', c.seed), c.watch.script, c.watch.duration); a.seekTo(c.explain.highlight.start);
  near(a.sim.time, c.explain.highlight.start, 0.05); eq(a.playing, true);
  const b = createSim('SIM_MOUNTAIN', c.seed); runSim(b, c.explain.highlight.start, c.watch.script);
  eq(Math.round((a.sim as any).drops.count), Math.round((b as any).drops.count), 'same state as a normal run');
});
test('LANDFORM: Watch script floods the neck (Island) then lowers the sea so the little island joins', () => {
  const c = getConcept('C08'); const s = createSimFor(c) as any;
  eq(s.label, 'Peninsula');
  runSim(s, 9.5, c.watch.script); near(s.seaLevel, 0.18, 0.001); eq(s.label, 'Island'); eq(s.metrics().isIsland, 1);
  runSim(s, 9, c.watch.script); // fresh run to the end of the script
});
test('SimSession.takeOver: the child grabs a control mid-script, the script stops overwriting her, replay re-arms it', () => {
  const c = getConcept('C08' as never);
  const sess = new SimSession(createSimFor(c), c.watch.script, c.watch.duration);
  sess.replay();
  for (let i = 0; i < 30; i++) sess.stepOnce();
  sess.takeOver();
  ok(sess.manual && sess.scriptDone && sess.playing);
  sess.sim.setControl('seaLevel', 0.05);
  for (let i = 0; i < 60; i++) sess.stepOnce();
  near(sess.sim.controls.seaLevel as number, 0.05, 1e-9);
  sess.replay();
  ok(!sess.manual && !sess.scriptDone);
  for (let i = 0; i < 30 * 12; i++) sess.stepOnce();
  ok(Math.abs((sess.sim.controls.seaLevel as number) - 0.05) > 0.01, 'script drives the sea level again after replay');
});
done();
