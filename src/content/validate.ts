import type { CaseFile, Concept, ConceptId, DuelDeck, PlacesFile } from '../types';
import { parseCheck } from '../learning/labChecks';

export interface Problem { level: 'error' | 'warn'; where: string; message: string }

const SIMS = ['SIM_EVAP', 'SIM_CLOUD', 'SIM_RAIN', 'SIM_WIND', 'SIM_BREEZE', 'SIM_MOUNTAIN', 'SIM_TIDE', '3D_LANDFORM'];
const TRAILS = ['water', 'air', 'coast'];
const BANNED = /\b(wrong|incorrect|fail|failed|easy|simple|just|obviously)\b/i;
const SOUND_IDS = ['tap', 'pop', 'correct', 'notquite', 'stamp', 'rank_up', 'rain_drizzle', 'rain_steady', 'rain_heavy', 'waves', 'wind_soft', 'thunder_far'];

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const sentences = (s: string) => s.split(/(?<=[.!?])\s+/).filter(Boolean);

export function validateAll(input: { concepts: Concept[]; decks: DuelDeck[]; cases: CaseFile[]; places: PlacesFile }, iconNames?: Set<string>): Problem[] {
  const out: Problem[] = [];
  const err = (where: string, message: string) => out.push({ level: 'error', where, message });
  const warn = (where: string, message: string) => out.push({ level: 'warn', where, message });
  const { concepts, decks, cases, places } = input;
  const ids = new Set<string>(concepts.map((c) => c.id));
  const checkIcon = (where: string, name?: string) => { if (name && iconNames && !iconNames.has(name)) err(where, `unknown icon "${name}"`); };
  const childText = (where: string, s: string | undefined) => {
    if (!s) return;
    const m = BANNED.exec(s);
    if (m) warn(where, `child-facing text contains "${m[0]}": ${s.slice(0, 60)}`);
    for (const sen of sentences(s)) if (words(sen) > 18) warn(where, `sentence over 18 words (${words(sen)}): ${sen.slice(0, 50)}...`);
  };

  if (concepts.length !== 8) err('concepts', `expected 8 concepts, found ${concepts.length}`);

  for (const c of concepts) {
    const w = c.id;
    if (!/^C0[1-8]$/.test(c.id)) err(w, 'id must be C01..C08');
    if (!TRAILS.includes(c.trail)) err(w, `bad trail ${c.trail}`);
    if (!SIMS.includes(c.sim)) err(w, `bad sim ${c.sim}`);
    for (const n of c.needs) if (!ids.has(n)) err(w, `needs unknown concept ${n}`);
    checkIcon(w + '.icon', c.icon);
    if (c.words.length < 1) err(w, 'needs at least one word card');
    c.words.forEach((x, i) => { checkIcon(`${w}.words[${i}]`, x.icon); childText(`${w}.words[${i}]`, x.meaning); });
    if (c.hook.lines.length !== 2) err(w, 'hook needs exactly 2 lines');
    c.hook.lines.forEach((l, i) => childText(`${w}.hook[${i}]`, l));
    checkIcon(`${w}.hook.icon`, c.hook.icon);

    const po = c.predict.options;
    if (po.length < 2 || po.length > 3) err(w, 'predict needs 2 or 3 options');
    if (!po.some((o) => o.id === c.predict.answer)) err(w, 'predict answer is not an option id');
    po.forEach((o) => checkIcon(`${w}.predict`, o.icon));

    const wa = c.watch;
    if (wa.duration < 12 || wa.duration > 20) err(w, `watch duration ${wa.duration} outside 12..20 s`);
    let last = -1;
    for (const s of wa.script) {
      if (s.t < last) err(w, `script not sorted at t=${s.t}`);
      last = s.t;
      if (s.t > wa.duration) err(w, `script step at t=${s.t} is after duration`);
      if ('caption' in s && !(s.caption in wa.captions)) err(w, `script references missing caption ${s.caption}`);
    }
    Object.entries(wa.captions).forEach(([k, v]) => childText(`${w}.captions.${k}`, v));
    childText(`${w}.revealMatch`, wa.revealMatch); childText(`${w}.revealMiss`, wa.revealMiss);

    const ex = c.explain;
    if (ex.misconceptions.length !== 4) err(w, `explain needs exactly 4 misconceptions, has ${ex.misconceptions.length}`);
    if (new Set(ex.misconceptions.map((m) => m.id)).size !== ex.misconceptions.length) err(w, 'duplicate misconception ids');
    ex.misconceptions.forEach((m) => { if (!m.parentLabel) err(w, `${m.id} missing parentLabel`); });
    (['home', 'india', 'world'] as const).forEach((k) => { if (!ex.examples[k]) err(w, `missing example ${k}`); });
    if (!(ex.highlight.start < ex.highlight.end && ex.highlight.end <= wa.duration)) err(w, 'highlight window must sit inside the Watch script');
    const lens = [ex.correct.text, ...ex.misconceptions.map((m) => m.text)].map((t) => t.length);
    const close = lens.slice(1).filter((l) => Math.abs(l - lens[0]) / lens[0] <= 0.2).length;
    if (close < 2) warn(w, 'fewer than 2 misconceptions within +/-20% length of the correct reason; runtime picks the 2 closest');
    childText(`${w}.explain.q`, ex.question);

    if (c.nameIt.length !== 2) err(w, 'nameIt needs exactly 2 items');
    c.nameIt.forEach((n, i) => {
      if (n.kind !== 'wind_game' && (n.answer < 0 || n.answer >= n.options.length)) err(`${w}.nameIt[${i}]`, 'answer index out of range');
      if (n.kind !== 'wind_game' && n.options.length < 2) err(`${w}.nameIt[${i}]`, 'needs 2+ options');
      if (n.optionIcons && n.optionIcons.length !== n.options.length) err(`${w}.nameIt[${i}]`, 'optionIcons length mismatch');
      checkIcon(`${w}.nameIt[${i}]`, n.promptIcon);
      n.promptIcons?.forEach((p) => checkIcon(`${w}.nameIt[${i}]`, p));
      n.optionIcons?.forEach((p) => checkIcon(`${w}.nameIt[${i}]`, p));
      if (n.promptSound && !SOUND_IDS.includes(n.promptSound)) err(`${w}.nameIt[${i}]`, `unknown sound ${n.promptSound}`);
    });
    if (!c.twist.options.some((o) => o.id === c.twist.answer)) err(w, 'twist answer is not an option id');
    if (c.faq.length < 3 || c.faq.length > 5) err(w, `faq needs 3 to 5 entries, has ${c.faq.length}`);
    c.faq.forEach((f, i) => childText(`${w}.faq[${i}]`, f.a));
    if (words(c.knowledgePack) > 300) err(w, `knowledgePack is ${words(c.knowledgePack)} words (max 300)`);

    if (c.labChallenges.length < 2 || c.labChallenges.length > 3) err(w, 'needs 2 or 3 lab challenges');
    for (const l of c.labChallenges) {
      if (l.type === 'reach_state') { if (!l.check || !parseCheck(l.check)) err(`${w}.${l.id}`, `unparseable check "${l.check}"`); }
      else if (!l.answer || !l.reason) err(`${w}.${l.id}`, 'is_it_possible needs answer and reason');
    }
    if (c.mission.answers.length < 2) err(w, 'mission needs 2+ answers');
    if (/\b(outside|outdoors|beach|seaside|go out|drive|storm|visit)\b/i.test(c.mission.text) && !/grown-up/i.test(c.mission.text)) err(w, 'outdoor mission is missing the "Take a grown-up with you." safety tag');
  }

  // prerequisite cycles
  const seen = new Set<string>();
  const visit = (id: ConceptId, stack: string[]) => {
    if (stack.includes(id)) { err('concepts', `prerequisite cycle: ${[...stack, id].join(' > ')}`); return; }
    if (seen.has(id)) return;
    seen.add(id);
    const c = concepts.find((x) => x.id === id);
    c?.needs.forEach((n) => visit(n, [...stack, id]));
  };
  concepts.forEach((c) => visit(c.id, []));

  if (decks.length !== 6) err('decks', `expected 6 decks, found ${decks.length}`);
  for (const d of decks) {
    if (!ids.has(d.concept)) err(d.id, `unknown concept ${d.concept}`);
    if (d.items.length !== 8) err(d.id, `deck needs 8 items, has ${d.items.length}`);
    if (d.sides.length < 2 || d.sides.length > 3) err(d.id, 'deck needs 2 or 3 sides');
    d.sides.forEach((s) => checkIcon(`${d.id}.side`, s.icon));
    for (const it of d.items) {
      if (!d.sides.some((s) => s.id === it.side)) err(d.id, `item ${it.id} has unknown side ${it.side}`);
      if (it.kind === 'sound' && (!it.sound || !SOUND_IDS.includes(it.sound))) err(d.id, `item ${it.id} has bad sound`);
      if (!it.reason) err(d.id, `item ${it.id} missing reason`);
      if (it.concept && !ids.has(it.concept)) err(d.id, `item ${it.id} has unknown concept`);
      childText(`${d.id}.${it.id}`, it.reason);
    }
  }

  if (cases.length !== 6) err('cases', `expected 6 cases, found ${cases.length}`);
  for (const k of cases) {
    k.needs.forEach((n) => { if (!ids.has(n)) err(k.id, `needs unknown ${n}`); });
    if (k.questions.length < 2 || k.questions.length > 3) err(k.id, 'needs 2 or 3 questions');
    for (const q of [...k.questions, k.twist]) if (!q.options.some((o) => o.id === q.answer)) err(k.id, `question "${q.prompt.slice(0, 30)}" has bad answer id`);
    if (k.clues.length < 1 || k.clues.length > 3) err(k.id, 'needs 1 to 3 clue cards');
    if (k.bigWhy.chips.length !== 3) err(k.id, 'build-it needs exactly 3 slots');
    k.bigWhy.chips.forEach((s, i) => { if (!s.options.some((o) => o.id === s.answer)) err(k.id, `slot ${i} bad answer`); if (s.options.length !== 3) err(k.id, `slot ${i} needs 3 options`); });
    if (!k.bigWhy.keyIdeas.some((x) => x.required)) err(k.id, 'needs at least one required key idea');
    const src = concepts.find((c) => c.id === k.bigWhy.watchConcept);
    if (!src) err(k.id, 'unknown watchConcept');
    else k.bigWhy.watchFor.forEach((m) => { if (!src.explain.misconceptions.some((x) => x.id === m)) err(k.id, `watchFor ${m} not in ${src.id}`); });
    k.clues.forEach((cl) => { if (cl.kind === 'photo') checkIcon(`${k.id}.clue`, cl.icon); });
    checkIcon(`${k.id}.reveal`, k.reveal.icon);
    k.map.elements.forEach((e) => { if (e.t === 'icon') checkIcon(`${k.id}.map`, e.name); });
  }

  if (places.places.length !== 20) err('places', `expected 20 places, found ${places.places.length}`);
  const pids = new Set(places.places.map((p) => p.id));
  for (const p of places.places) {
    if (Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) err(p.id, 'bad coordinates');
    p.concepts.forEach((c) => { if (!ids.has(c)) err(p.id, `unknown concept ${c}`); });
    if (p.facts.length < 1 || p.facts.length > 3) err(p.id, 'needs 1 to 3 facts');
    checkIcon(p.id, p.icon);
  }
  places.finds.forEach((f) => f.targets.forEach((t) => { if (!pids.has(t)) err(f.id, `unknown target ${t}`); }));
  return out;
}
