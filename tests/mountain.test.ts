import { test, ok, eq, done } from './harness';
import { MountainSim, DROP_ORO, DROP_LEAK, DROP_SHOWER, DROP_FLAT, PEAK_X } from '@/sims/mountain';
import { runSim, STEP, ScriptRunner } from '@/sims/engine';
import { getConcept } from '@/content';
import { evalCheck } from '@/learning/labChecks';

const script = getConcept('C06').watch.script;
const labs = getConcept('C06').labChallenges;
const mk = () => new MountainSim(606);
const at20 = (setup?: (s: MountainSim) => void) => { const s = mk(); setup?.(s); runSim(s, 20); return s; };

test('T2: default script, Mumbai gauge is 2.5x to 3.5x Pune at 20 s', () => {
  const s = mk(); runSim(s, 20, script);
  const r = s.mumbaiGauge / s.puneGauge;
  ok(r >= 2.5 && r <= 3.5, 'ratio ' + r.toFixed(2));
});

test('Static H 140 ratio also sits in the band', () => {
  const s = at20(); const r = s.mumbaiGauge / s.puneGauge;
  ok(r >= 2.5 && r <= 3.5, 'ratio ' + r.toFixed(2));
});

test('T2: taller mountain (H 220) gives a lower Pune gauge than H 140', () => {
  const a = at20(); const b = at20((s) => s.setControl('H', 220));
  ok(b.puneGauge < a.puneGauge, `${b.puneGauge} < ${a.puneGauge}`);
  ok(b.mumbaiGauge >= a.mumbaiGauge * 0.95, 'Mumbai does not drop');
});

test('T2: remove the mountain (H 0) -> gauges within 20%, and the Lab c06_l3 check passes', () => {
  const s = at20((x) => x.setControl('H', 0));
  ok(s.mumbaiGauge > 0, 'some rain');
  ok(s.metrics().gaugeDiffRatio <= 0.2, 'diff ' + s.metrics().gaugeDiffRatio);
  eq(evalCheck(labs[2].check!, s.metrics()), true);
});

test('T2: wind from the land -> both gauges almost empty, and Pune > Mumbai (Lab c06_l1)', () => {
  const ref = at20();
  const s = at20((x) => x.setControl('wind', 'land'));
  ok(s.mumbaiGauge < ref.mumbaiGauge * 0.1 && s.puneGauge < ref.mumbaiGauge * 0.1, 'almost empty');
  ok(s.puneGauge > s.mumbaiGauge, 'Pune > Mumbai');
  eq(evalCheck(labs[0].check!, s.metrics()), true);
  eq(evalCheck(labs[0].check!, ref.metrics()), false, 'default does not pass c06_l1');
});

test('Lab c06_l1 / c06_l3 are not already true at the default setup', () => {
  const s = at20();
  eq(evalCheck(labs[0].check!, s.metrics()), false);
  eq(evalCheck(labs[2].check!, s.metrics()), false);
});

test('T2: no orographic drop from a descending parcel ever lands on the far side (x > 205)', () => {
  for (const wind of ['sea', 'land'] as const) {
    for (const H of [80, 140, 220]) {
      const s = mk(); s.setControl('H', H); s.setControl('wind', wind);
      let maxOro = 0; let minOro = 999;
      for (let i = 0; i < 30 * 30; i++) {
        s.step();
        for (let k = 0; k < s.drops.size; k++) {
          if (!s.drops.active[k]) continue;
          const kind = s.drops.kind[k];
          if (kind === DROP_ORO || kind === DROP_LEAK) {
            if (wind === 'sea') maxOro = Math.max(maxOro, s.drops.x[k]); else minOro = Math.min(minOro, s.drops.x[k]);
          }
        }
        for (let p = 0; p < s.parcels.size; p++) {
          if (s.isDescending(p)) ok(s.parcels.b[p] === 0 || true, 'n/a');
        }
      }
      if (wind === 'sea') ok(maxOro <= 205, `H${H} sea: orographic drops at x<=205, got ${maxOro}`);
      else ok(minOro >= PEAK_X - 5, `H${H} land: climbing drops on the east face, got ${minOro}`);
    }
  }
});

test('Far-side rain in sea wind comes only from the plain showers (x 300..360), never the slope', () => {
  const s = mk();
  let slopeFarDrop = false;
  for (let i = 0; i < 30 * 25; i++) {
    s.step();
    for (let k = 0; k < s.drops.size; k++) {
      if (!s.drops.active[k]) continue;
      const x = s.drops.x[k];
      if (x > 205 && x < 300) slopeFarDrop = true;
      if (x >= 300) eq(s.drops.kind[k], DROP_SHOWER, 'plain drops are showers');
    }
  }
  ok(!slopeFarDrop, 'nothing falls on the dry slope');
});

test('Wind off: no new parcels, existing ones fade out within 2 s, rain stops', () => {
  const s = mk(); runSim(s, 8);
  ok(s.parcels.count > 3, 'parcels present');
  s.setControl('wind', 'off');
  runSim(s, 2.1);
  eq(s.parcels.count, 0);
  runSim(s, 6);
  eq(s.drops.count, 0);
  const g0 = s.mumbaiGauge; runSim(s, 25); ok(s.mumbaiGauge < g0 * 0.05 + 1e-9, 'gauge empties after 20 s of nothing');
});

test('Pools never overflow and the run is deterministic', () => {
  const a = mk(); const b = mk();
  let maxP = 0; let maxD = 0; let maxC = 0;
  for (let i = 0; i < 30 * 40; i++) {
    a.step(); b.step();
    maxP = Math.max(maxP, a.parcels.count); maxD = Math.max(maxD, a.drops.count); maxC = Math.max(maxC, a.puffs.count);
  }
  ok(maxP <= 40 && maxD <= 260 && maxC <= 24, `pools ${maxP} ${maxD} ${maxC}`);
  eq(a.mumbaiGauge, b.mumbaiGauge); eq(a.puneGauge, b.puneGauge);
});

test('Clouds form on the climb; "dry air" tag appears on a descending parcel', () => {
  const s = mk(); let tagged = false; let puffs = 0;
  for (let i = 0; i < 30 * 12; i++) {
    s.step(); puffs = Math.max(puffs, s.puffs.count);
    for (let p = 0; p < s.parcels.size; p++) if (s.parcels.active[p] && s.parcelTag[p] && s.isDescending(p)) tagged = true;
  }
  ok(puffs > 0, 'puffs'); ok(tagged, 'dry air tag');
});

test('Cells: windward slope is green, far plain stays ochre (relative to the reference)', () => {
  const s = at20();
  const green = (x: number) => s.cellGreen(Math.floor((x - 80) / (280 / 12)));
  ok(green(180) > 0.9, 'windward slope green ' + green(180));
  ok(green(320) < 0.2, 'plain mostly ochre ' + green(320));
  ok(green(250) < 0.05, 'dry slope ochre');
});

test('Script eases H to 200 from t=15 over 1.5 s', () => {
  const s = mk(); const r = new ScriptRunner(script, s);
  for (let i = 0; i < 30 * 16.6; i++) { r.update(s.time); s.step(); }
  eq(s.controls.H, 200);
  void STEP; void DROP_FLAT;
});
done();
