import type { CaseFile, Concept, ConceptId, DuelDeck } from '../types';
import { validateAll } from './validate';

export { CONCEPTS, DECKS, CASES, PLACES } from './data';
import { CONCEPTS, DECKS, CASES, PLACES } from './data';

const conceptMap = new Map<string, Concept>(CONCEPTS.map((c) => [c.id, c]));
const deckMap = new Map<string, DuelDeck>(DECKS.map((d) => [d.id, d]));
const caseMap = new Map<string, CaseFile>(CASES.map((c) => [c.id, c]));

export function getConcept(id: string): Concept {
  const c = conceptMap.get(id);
  if (!c) throw new Error(`Unknown concept ${id}`);
  return c;
}
export const maybeConcept = (id: string): Concept | undefined => conceptMap.get(id);
export function getDeck(id: string): DuelDeck {
  const d = deckMap.get(id);
  if (!d) throw new Error(`Unknown deck ${id}`);
  return d;
}
export function getCase(id: string): CaseFile {
  const c = caseMap.get(id);
  if (!c) throw new Error(`Unknown case ${id}`);
  return c;
}
export const deckForConcept = (id: ConceptId): DuelDeck | undefined => DECKS.find((d) => d.concept === id);
export const CONCEPT_IDS: ConceptId[] = CONCEPTS.map((c) => c.id);

// Invalid content JSON fails the dev build with a clear message.
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  const problems = validateAll({ concepts: CONCEPTS, decks: DECKS, cases: CASES, places: PLACES }).filter((p) => p.level === 'error');
  if (problems.length) {
    throw new Error('GlobeProbe content is invalid:\n' + problems.map((p) => ` - [${p.where}] ${p.message}`).join('\n'));
  }
}
