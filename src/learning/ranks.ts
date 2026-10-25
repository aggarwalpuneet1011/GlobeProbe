// Ranks. Never go down.
import { RANKS } from '../content/copy';
import type { ConceptProgress } from '../types';

export type RankIndex = 0 | 1 | 2 | 3;

export function computeRankIndex(progress: ConceptProgress[], casesSolved: number): RankIndex {
  const explained = progress.filter((p) => p.level >= 3).length;
  const mastered = progress.filter((p) => p.level >= 4).length;
  if (mastered >= 8 && casesSolved >= 4) return 3;
  if (explained >= 6 && casesSolved >= 1) return 2;
  if (explained >= 3) return 1;
  return 0;
}

export const rankIndexOf = (name: string): RankIndex => {
  const i = (RANKS as readonly string[]).indexOf(name);
  return (i < 0 ? 0 : i) as RankIndex;
};

export interface RankResult { rank: string; index: RankIndex; promoted: boolean }

/** `current` is the rank stored on the profile. The result is max(current, computed). */
export function updateRank(current: string, progress: ConceptProgress[], casesSolved: number): RankResult {
  const cur = rankIndexOf(current);
  const comp = computeRankIndex(progress, casesSolved);
  const index = (comp > cur ? comp : cur) as RankIndex;
  return { rank: RANKS[index], index, promoted: index > cur };
}
