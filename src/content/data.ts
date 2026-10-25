// Raw content collections with no dev-time validation side effects (used by scripts and tests).
import type { CaseFile, Concept, DuelDeck, PlacesFile } from '../types';
import C01 from './concepts/C01.json';
import C02 from './concepts/C02.json';
import C03 from './concepts/C03.json';
import C04 from './concepts/C04.json';
import C05 from './concepts/C05.json';
import C06 from './concepts/C06.json';
import C07 from './concepts/C07.json';
import C08 from './concepts/C08.json';
import D1 from './duels/D1.json';
import D2 from './duels/D2.json';
import D3 from './duels/D3.json';
import D4 from './duels/D4.json';
import D5 from './duels/D5.json';
import D6 from './duels/D6.json';
import case1 from './cases/case1.json';
import case2 from './cases/case2.json';
import case3 from './cases/case3.json';
import case4 from './cases/case4.json';
import case5 from './cases/case5.json';
import case6 from './cases/case6.json';
import placesJson from './places.json';

export const CONCEPTS = [C01, C02, C03, C04, C05, C06, C07, C08] as unknown as Concept[];
export const DECKS = [D1, D2, D3, D4, D5, D6] as unknown as DuelDeck[];
export const CASES = [case1, case2, case3, case4, case5, case6] as unknown as CaseFile[];
export const PLACES = placesJson as unknown as PlacesFile;
