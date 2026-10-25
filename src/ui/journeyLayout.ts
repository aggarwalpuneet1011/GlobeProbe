// Journey trail layout: positions as fractions of the width and pixels up from the bottom. Pure data.
import type { ConceptId, Trail } from '../types';

export const JOURNEY_HEIGHT = 640;
export const POS: Record<ConceptId, { x: number; y: number }> = {
  C01: { x: 0.2, y: 70 }, C02: { x: 0.2, y: 250 }, C03: { x: 0.14, y: 440 },
  C04: { x: 0.52, y: 70 }, C05: { x: 0.7, y: 250 },
  C06: { x: 0.44, y: 410 },
  C07: { x: 0.86, y: 70 }, C08: { x: 0.86, y: 450 },
};
export interface Edge { from: ConceptId; to: ConceptId; trail: Trail }
export const EDGES: Edge[] = [
  { from: 'C01', to: 'C02', trail: 'water' }, { from: 'C02', to: 'C03', trail: 'water' },
  { from: 'C04', to: 'C05', trail: 'air' },
  { from: 'C02', to: 'C06', trail: 'water' }, { from: 'C04', to: 'C06', trail: 'air' },
  { from: 'C07', to: 'C08', trail: 'coast' },
];
