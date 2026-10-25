// Validation and sanitising of model output (bad shape = failure, never show raw text that failed validation).
import { AiError } from './errors';
import { NOT_SURE, OFF_TOPIC } from './prompts';

export interface WhyResult { transcript: string; inScope: boolean; answer: string; suggestLab: boolean }
export interface CaseResult { transcript: string; ideasFound: string[]; misconceptionsFound: string[]; childFeedback: string; parentNote: string }

const BANNED = /\b(AI|A\.I\.|artificial intelligence|language model|Gemini|Google|chatbot|the internet|large language)\b/i;
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const clean = (s: string) => s.replace(/[*_#`>]/g, '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/** Keep whole sentences up to `maxWords` and `maxSentences`; if even the first sentence is too long, cut at the word limit. */
export function truncateAtSentence(text: string, maxWords: number, maxSentences = 3): string {
  const t = clean(text);
  if (wordCount(t) <= maxWords && (t.match(/[.!?](\s|$)/g)?.length ?? 1) <= maxSentences) return t;
  const sentences = t.split(/(?<=[.!?])\s+/);
  let out = ''; let n = 0; let used = 0;
  for (const s of sentences) {
    const w = wordCount(s);
    if (used + w > maxWords || n >= maxSentences) break;
    out = out ? out + ' ' + s : s; used += w; n++;
  }
  if (out) return out;
  const cut = t.split(/\s+/).slice(0, maxWords).join(' ').replace(/[,;:]$/, '');
  return /[.!?]$/.test(cut) ? cut : cut + '.';
}

export function validateWhy(raw: unknown, conceptTitle: string): WhyResult {
  if (!isObj(raw) || typeof raw.answer !== 'string' || typeof raw.in_scope !== 'boolean' || typeof raw.transcript !== 'string') throw new AiError('VALIDATION', 'why shape');
  const inScope = raw.in_scope;
  let answer = clean(raw.answer);
  if (!answer) throw new AiError('VALIDATION', 'empty answer');
  if (BANNED.test(answer)) throw new AiError('VALIDATION', 'banned words');
  if (!inScope) {
    answer = /grown-up!?\s+Want to ask me/i.test(answer) || /^that'?s a great question for a grown-up/i.test(answer) ? OFF_TOPIC(conceptTitle) : NOT_SURE;
  } else {
    answer = truncateAtSentence(answer, 60, 3);
  }
  return { transcript: clean(raw.transcript).slice(0, 300), inScope, answer, suggestLab: raw.suggest_lab === true && inScope };
}

export function validateCase(raw: unknown, ideaIds: string[], misconceptionIds: string[]): CaseResult {
  if (!isObj(raw) || typeof raw.child_feedback !== 'string' || typeof raw.parent_note !== 'string' || typeof raw.transcript !== 'string' ||
    !Array.isArray(raw.ideas_found) || !Array.isArray(raw.misconceptions_found)) throw new AiError('VALIDATION', 'case shape');
  const ids = (a: unknown[], known: string[]) => Array.from(new Set(a.filter((x): x is string => typeof x === 'string' && known.includes(x))));
  let fb = truncateAtSentence(raw.child_feedback, 35, 3).replace(/\bwrong\b/gi, 'not quite');
  const pn = truncateAtSentence(raw.parent_note, 35, 3);
  if (!fb || BANNED.test(fb)) throw new AiError('VALIDATION', 'feedback');
  if (BANNED.test(pn)) throw new AiError('VALIDATION', 'note');
  fb = fb.trim();
  return {
    transcript: clean(raw.transcript).slice(0, 1000),
    ideasFound: ids(raw.ideas_found, ideaIds), misconceptionsFound: ids(raw.misconceptions_found, misconceptionIds),
    childFeedback: fb, parentNote: pn,
  };
}
