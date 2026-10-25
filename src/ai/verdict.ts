// Verdicts are computed in code, never taken from the model.
export type Verdict = 'solved' | 'almost' | 'not_yet';
export interface KeyIdea { id: string; required: boolean; text?: string }

export function computeVerdict(keyIdeas: KeyIdea[], ideasFound: string[], misconceptionsFound: string[], twistCorrect: boolean): Verdict {
  const all = new Set(keyIdeas.map((k) => k.id));
  const found = new Set(ideasFound.filter((i) => all.has(i)));           // drop unknown ids
  const required = keyIdeas.filter((k) => k.required).map((k) => k.id);
  const allRequired = required.length > 0 && required.every((r) => found.has(r));
  let v: Verdict;
  if (allRequired && misconceptionsFound.length === 0) v = 'solved';
  else if (required.some((r) => found.has(r))) v = 'almost';
  else v = 'not_yet';
  if (v === 'solved' && !twistCorrect) v = 'almost'; // Big Why solved but Twist missed
  return v;
}

/** Build-it (no AI): 3 slots. All correct = all required ideas found; 2 = almost; fewer = not yet. */
export function chipVerdict(correctSlots: number, twistCorrect: boolean): Verdict {
  let v: Verdict = correctSlots >= 3 ? 'solved' : correctSlots === 2 ? 'almost' : 'not_yet';
  if (v === 'solved' && !twistCorrect) v = 'almost';
  return v;
}
