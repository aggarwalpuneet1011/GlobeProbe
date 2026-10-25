import React from 'react';
import { useApp } from '../state/app';
import { RankUp } from './RankUp';

export function RankUpHost() {
  const { rankUp, showRankUp } = useApp();
  return <RankUp rank={rankUp} onClose={() => showRankUp(null)} />;
}
