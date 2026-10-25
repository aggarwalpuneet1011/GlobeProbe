import { test, ok, eq, near, done } from './harness';
import { buildHeightmap, landformState, HM_SIZE, HM_MAX, HM_FLOOR, planeHeights, terrainBand, heightAt, connectedLand, MAINLAND_SEED, PENINSULA_SEED, ISLAND_SEED, NECK_SADDLE, BRIDGE_SADDLE } from '@/three/heightmap';
import { getConcept } from '@/content';
import { ScriptRunner } from '@/sims/engine';
import { evalCheck } from '@/learning/labChecks';

const hm = buildHeightmap();

test('Heightmap range: max <= 1.2, has sea floor, deterministic', () => {
  let mx = -9, mn = 9; for (const v of hm) { mx = Math.max(mx, v); mn = Math.min(mn, v); }
  ok(mx <= HM_MAX + 1e-6 && mx > 0.9, 'max ' + mx); ok(mn >= HM_FLOOR - 1e-6 && mn < -0.25, 'min ' + mn);
  eq(buildHeightmap()[1234], hm[1234]); eq(hm.length, HM_SIZE * HM_SIZE);
});

test('T5 landform: default is a Peninsula; the neck floods at sea level >= 0.15 and it becomes an Island', () => {
  eq(landformState(hm, 0).label, 'Peninsula');
  eq(landformState(hm, 0.1).label, 'Peninsula');
  eq(landformState(hm, 0.12).label, 'Peninsula');
  eq(landformState(hm, 0.15).label, 'Island');
  eq(landformState(hm, 0.35).label, 'Island');
  eq(landformState(hm, -0.25).label, 'Peninsula');
});

test('T5 landform: the offshore island joins the mainland at sea level <= -0.2, not before', () => {
  eq(landformState(hm, 0).islandJoined, false);
  eq(landformState(hm, -0.1).islandJoined, false);
  eq(landformState(hm, -0.15).islandJoined, false);
  eq(landformState(hm, -0.2).islandJoined, true);
  eq(landformState(hm, -0.25).islandJoined, true);
  eq(landformState(hm, 0.35).islandJoined, false);
});

test('Neck is narrow and low; saddles sit where designed', () => {
  near(heightAt(104, 112), NECK_SADDLE, 0.07, 'neck centre');
  near(heightAt(108, 205), BRIDGE_SADDLE, 0.07, 'bridge centre');
  ok(heightAt(104, 112) < 0.15 && heightAt(104, 112) > 0.05, 'neck between sand and the 0.15 flood line');
  // width of dry land across the neck at sea 0 is small
  let w = 0; for (let y = 100; y < 125; y++) if (heightAt(104, y) > 0) w++;
  ok(w >= 3 && w <= 10, 'neck width px ' + w);
  // peninsula body and offshore island stay land across the whole slider
  ok(heightAt(PENINSULA_SEED.x, PENINSULA_SEED.y) > 0.6 && heightAt(ISLAND_SEED.x, ISLAND_SEED.y) > 0.4, 'seeds are high ground');
});

test('Island stays a separate island through the default and up to +0.35', () => {
  for (const s of [0, 0.1, 0.2, 0.35]) {
    const m = connectedLand(hm, s, MAINLAND_SEED);
    eq(m[Math.round(ISLAND_SEED.y) * HM_SIZE + Math.round(ISLAND_SEED.x)], 0, 'sea ' + s);
  }
});

test('Terrain bands and plane vertex heights', () => {
  eq([-0.1, 0.04, 0.05, 0.6, 0.61].map(terrainBand), ['sand', 'sand', 'green', 'green', 'stone']);
  const ph = planeHeights(hm, 96); eq(ph.length, 97 * 97); ok(Math.max(...ph) <= HM_MAX + 1e-6, 'max');
});

test('C08 Watch script drives seaLevel 0 -> 0.18 -> -0.22 and Lab checks match the flood rules', () => {
  const c = getConcept('C08');
  const fake = { id: '3D_LANDFORM', time: 0, controls: { seaLevel: 0, camera: 'angle' } as Record<string, number | string | boolean>, reset() {}, step() {}, metrics: () => ({}), specs: () => ({}), setControl(k: string, v: number | string | boolean) { this.controls[k] = v; } };
  const r = new ScriptRunner(c.watch.script, fake as never);
  const seen: number[] = [];
  for (let t = 0; t <= 15; t += 1 / 30) { r.update(t); seen.push(fake.controls.seaLevel as number); }
  near(seen[Math.round(9 * 30)], 0.18, 0.001); near(seen[seen.length - 1], -0.22, 0.001);
  for (const [lvl, i, want] of [[0.15, 0, true], [0.14, 0, false], [-0.2, 1, true], [-0.19, 1, false]] as const) {
    eq(evalCheck(c.labChallenges[i].check!, { seaLevel: lvl }), want, `${lvl}`);
  }
  eq(landformState(hm, 0.18).label, 'Island'); eq(landformState(hm, -0.22).islandJoined, true);
});
done();
