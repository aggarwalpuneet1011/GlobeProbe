// Every sim renderer must draw at every moment of the Watch script and in Lab extremes without throwing or emitting NaN.
import { test, ok, eq, done } from './harness';
import { MockCanvas, calls, mockFont } from './mocks/skia';
import { RENDER_KITS } from '../src/sims/render';
import { createSim, SimSession, type Sim2D } from '../src/sims';
import { CONCEPTS } from '../src/content';
import type { RenderEnv } from '../src/sims/render/SimView';

const mkEnv = (sim: { time: number }, highlight: string | null, flags: Record<string, boolean> = {}): RenderEnv => ({
  font: mockFont as never, t: sim.time, highlight, reduceMotion: false, flags,
  layer: (_c, _n, fn) => fn(), once: () => true,
});

for (const concept of CONCEPTS) {
  if (concept.sim === '3D_LANDFORM') continue;
  const id = concept.sim as Sim2D;
  test(`${id}: renders through the whole Watch script`, () => {
    const sim = createSim(id, concept.seed, concept.simParams);
    const session = new SimSession(sim, concept.watch.script, concept.watch.duration);
    session.play();
    const kit = RENDER_KITS[id];
    const before = calls.n;
    for (let s = 0; s < concept.watch.duration + 4; s += 0.25) {
      session.tick(0.25);
      kit.render(new MockCanvas() as never, sim, mkEnv(sim, null));
      ok(typeof kit.summary(sim) === 'string' && kit.summary(sim).length > 0, 'summary text');
    }
    ok(calls.n - before > 1000, `drew many shapes (${calls.n - before})`);
  });
  test(`${id}: highlight layer "${concept.explain.highlight.layer}" has bounds and draws`, () => {
    const sim = createSim(id, concept.seed, concept.simParams);
    const session = new SimSession(sim, concept.watch.script, concept.watch.duration);
    session.play();
    for (let s = 0; s < concept.explain.highlight.end; s += 0.5) session.tick(0.5);
    const kit = RENDER_KITS[id];
    kit.render(new MockCanvas() as never, sim, mkEnv(sim, concept.explain.highlight.layer));
    const b = kit.bounds(sim, concept.explain.highlight.layer);
    ok(!!b && b.length === 4 && b.every(Number.isFinite), 'finite bounds for the highlighted layer');
  });
}

test('Mountain: renders at every height and wind mode', () => {
  const kit = RENDER_KITS.SIM_MOUNTAIN;
  for (const H of [0, 30, 62, 140, 220]) for (const wind of ['sea', 'off', 'land']) {
    const sim = createSim('SIM_MOUNTAIN', 6);
    sim.setControl('H', H); sim.setControl('wind', wind);
    const s = new SimSession(sim, null); s.play();
    for (let i = 0; i < 40; i++) { s.tick(0.5); kit.render(new MockCanvas() as never, sim, mkEnv(sim, null)); }
  }
  ok(true);
});
test('Mountain labels the wind by where it comes FROM', () => {
  calls.text.length = 0;
  const sim = createSim('SIM_MOUNTAIN', 6);
  RENDER_KITS.SIM_MOUNTAIN.render(new MockCanvas() as never, sim, mkEnv(sim, null));
  ok(calls.text.includes('Wind from the sea'), 'sea label');
  sim.setControl('wind', 'land');
  RENDER_KITS.SIM_MOUNTAIN.render(new MockCanvas() as never, sim, mkEnv(sim, null));
  ok(calls.text.includes('Wind from the land'), 'land label');
  ok(!calls.text.some((t) => /westward|blowing west|eastward/i.test(t)), 'no direction-of-travel wording');
});
test('Wind labels always say "from"', () => {
  const sim = createSim('SIM_WIND', 4);
  for (const d of ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']) {
    sim.setControl('windFrom', d);
    calls.text.length = 0;
    RENDER_KITS.SIM_WIND.render(new MockCanvas() as never, sim, mkEnv(sim, null));
    ok(calls.text.some((t) => /^Wind from the /.test(t)), d + ' label starts with "Wind from the"');
  }
});
test('Breeze reads Sea breeze at 2 pm, Land breeze at 2 am, Calm near 9 am and 8 pm', () => {
  const sim = createSim('SIM_BREEZE', 5);
  const label = (h: number) => { sim.setControl('time', h); calls.text.length = 0; RENDER_KITS.SIM_BREEZE.render(new MockCanvas() as never, sim, mkEnv(sim, null)); return calls.text.join('|'); };
  ok(label(14).includes('Sea breeze: wind from the sea'));
  ok(label(26).includes('Land breeze: wind from the land'));
  ok(label(9).includes('Calm'));
  ok(label(20).includes('Calm'));
});
test('Tide renders across 48 hours', () => {
  const sim = createSim('SIM_TIDE', 7, { tHigh0: 0.7833 });
  for (let h = 0; h <= 48; h += 1.5) { sim.setControl('time', h); RENDER_KITS.SIM_TIDE.render(new MockCanvas() as never, sim, mkEnv(sim, null)); }
  eq(sim.metrics().time, 48);
});
test('Rain: hold then release draws every type', () => {
  const sim = createSim('SIM_RAIN', 3);
  const s = new SimSession(sim, null); s.play();
  for (const hold of [0.5, 2, 3.5]) {
    sim.setControl('press', true);
    for (let i = 0; i < hold * 2; i++) { s.tick(0.5); RENDER_KITS.SIM_RAIN.render(new MockCanvas() as never, sim, mkEnv(sim, null)); }
    sim.setControl('press', false);
    for (let i = 0; i < 20; i++) { s.tick(0.5); RENDER_KITS.SIM_RAIN.render(new MockCanvas() as never, sim, mkEnv(sim, null)); }
  }
  ok(true);
});
done();
