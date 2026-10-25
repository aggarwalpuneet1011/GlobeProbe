import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';
import { T } from './Text';
import { ChunkyButton } from './ChunkyButton';
import { useToast } from './Toast';
import { useApp } from '../state/app';
import { deckForConcept, getConcept } from '../content';
import { HOME, STOP } from '../content/copy';
import { knowItAllowed } from '../learning/mastery';
import { nowIso } from '../util/time';
import type { ConceptId } from '../types';

/** The card behind a stamped Stop: Replay, Lab, Duel, and "I know this!" until Mastered. */
export function StopCardSheet({ conceptId, onClose }: { conceptId: ConceptId | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const app = useApp();
  const concept = conceptId ? getConcept(conceptId) : null;
  const prog = conceptId ? app.progressOf(conceptId) : undefined;
  const deck = conceptId ? deckForConcept(conceptId) : undefined;
  const go = (path: string) => { onClose(); router.push(path as never); };
  return (
    <BottomSheet visible={!!concept} onClose={onClose}>
      {concept ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Icon name={concept.icon} size={64} />
            <T v="h2" style={{ flex: 1 }}>{concept.title}</T>
          </View>
          <ChunkyButton label={STOP.replay} icon="replay" onPress={() => go(`/stop/${concept.id}?mode=replay`)} />
          <ChunkyButton kind="secondary" label="Lab" icon="lab" onPress={() => go(`/lab/${concept.sim}`)} />
          {deck ? <ChunkyButton kind="secondary" label="Duel" icon="case" onPress={() => go(`/duel/${deck.id}`)} /> : null}
          {prog && prog.level < 4 ? (
            <ChunkyButton kind="ghost" label={HOME.iKnowThis} icon="know_it" onPress={() => {
              if (!knowItAllowed(prog, nowIso())) { toast(STOP.knowItBlocked); return; }
              go(`/stop/${concept.id}?mode=knowit`);
            }} />
          ) : null}
        </>
      ) : null}
    </BottomSheet>
  );
}
