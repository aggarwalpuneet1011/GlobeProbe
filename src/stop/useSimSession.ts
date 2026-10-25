import { useEffect, useMemo, useRef } from 'react';
import type { Concept } from '../types';
import { SimSession, createSimFor } from '../sims';

/** One SimSession per concept for the whole Stop. Captions arrive through `sink`, which the Watch step sets while it is on screen. */
export function useSimSession(concept: Concept) {
  const sink = useRef<((captionId: string) => void) | null>(null);
  const session = useMemo(
    () => new SimSession(createSimFor(concept), concept.watch.script, concept.watch.duration, (id) => sink.current?.(id)),
    [concept.id], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => () => session.pause(), [session]);
  return { session, sink };
}
