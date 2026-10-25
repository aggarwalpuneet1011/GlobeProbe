// "Continue" card logic. Deterministic; no AI.
import type { ConceptId, ConceptProgress } from '../types';

export type NeedsMap = Record<ConceptId, ConceptId[]>;
const EXPLAINED = 3;

const byId = (a: ConceptProgress, b: ConceptProgress) => a.conceptId.localeCompare(b.conceptId);
const time = (s: string | null) => (s ? Date.parse(s) : 0);

export const stopFinished = (p: ConceptProgress | undefined) => !!p && p.stopStep >= 6;

/** "Needs" means the prerequisite's Stop has been finished once. */
export function isOpen(id: ConceptId, progress: Map<ConceptId, ConceptProgress>, needs: NeedsMap): boolean {
  return needs[id].every((n) => stopFinished(progress.get(n)));
}

export function nextStop(all: ConceptProgress[], needs: NeedsMap, schoolSyncConceptId: ConceptId | null): ConceptId | null {
  const map = new Map<ConceptId, ConceptProgress>(all.map((p) => [p.conceptId, p]));
  const sorted = all.slice().sort(byId);

  // 1. Parent pinned a concept and it is open and not yet Explained.
  if (schoolSyncConceptId) {
    const p = map.get(schoolSyncConceptId);
    if (p && p.level < EXPLAINED && isOpen(schoolSyncConceptId, map, needs)) return schoolSyncConceptId;
  }

  // 2. A Stop started but not finished: the most recently started.
  const inProgress = sorted.filter((p) => !!p.startedAt && p.stopStep < 6 && isOpen(p.conceptId, map, needs));
  if (inProgress.length) return inProgress.reduce((a, b) => (time(b.startedAt) > time(a.startedAt) ? b : a)).conceptId;

  // 3. Open concepts below Explained: lowest ID that is not the last one finished (rotates trails).
  const open = sorted.filter((p) => p.level < EXPLAINED && isOpen(p.conceptId, map, needs));
  if (open.length) {
    const finished = sorted.filter((p) => !!p.finishedAt);
    const last = finished.length ? finished.reduce((a, b) => (time(b.finishedAt) >= time(a.finishedAt) ? b : a)).conceptId : null;
    const others = open.filter((p) => p.conceptId !== last);
    // If the last-finished one is the only thing open, return it: replaying a Stop with a new example is how it reaches Explained.
    return (others[0] ?? open[0]).conceptId;
  }

  // 4. Explained but not Mastered: oldest lastSeenAt (Twist practice).
  const notMastered = sorted.filter((p) => p.level === EXPLAINED);
  if (notMastered.length) return notMastered.reduce((a, b) => (time(b.lastSeenAt) < time(a.lastSeenAt) ? b : a)).conceptId;

  return null;
}
