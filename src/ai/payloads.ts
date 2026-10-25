// What Gemini receives: the question or answer, concept/case content and the rank word. Never name, photos, profile or location.
import type { CaseFile, Concept } from '../types';
import { getConcept } from '../content';
import { truthSheetText } from '../content/truth';
import { KEY_TEST_PROMPT } from './prompts';

export interface WhyPayload { conceptId: string; conceptTitle: string; rank: string; knowledgePack: string; truthSheet: string; question: string }
export function whyPayload(c: Concept, rank: string, question: string): WhyPayload {
  return { conceptId: c.id, conceptTitle: c.title, rank, knowledgePack: c.knowledgePack, truthSheet: truthSheetText(), question };
}

export interface CasePayload {
  caseId: string; caseSummary: string;
  keyIdeas: { id: string; text: string }[]; misconceptions: { id: string; text: string }[]; answerText: string;
}
export function caseMisconceptions(c: CaseFile): { id: string; text: string }[] {
  const concept = getConcept(c.bigWhy.watchConcept);
  return c.bigWhy.watchFor.flatMap((id) => {
    const m = concept.explain.misconceptions.find((x) => x.id === id);
    return m ? [{ id, text: m.text }] : [];
  });
}
export function caseSummary(c: CaseFile): string {
  const clues = c.clues.map((k) => {
    switch (k.kind) {
      case 'photo': case 'note': return k.text;
      case 'witness': return `${k.who}: ${k.text}`;
      case 'bars': return `${k.title}: ` + k.bars.map((b) => `${b.label} ${b.value} ${k.unit}`).join(', ');
      case 'tides': return `${k.title}: ` + k.rows.map((r) => `${r.label} ${r.time}`).join(', ');
      case 'thermos': return `${k.title}: ` + k.items.map((r) => `${r.label} ${r.value}`).join(', ');
    }
  });
  return `${c.title}. ${c.bigWhy.prompt} Clues: ${clues.join(' | ')}`.slice(0, 900);
}
export function casePayload(c: CaseFile, answerText: string): CasePayload {
  return {
    caseId: c.id, caseSummary: caseSummary(c),
    keyIdeas: c.bigWhy.keyIdeas.map((k) => ({ id: k.id, text: k.text })),
    misconceptions: caseMisconceptions(c), answerText,
  };
}
export const keyTestPayload = () => KEY_TEST_PROMPT;
