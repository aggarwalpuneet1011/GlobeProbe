// Shared types. Content shapes follow the JSON files in src/content.

export type ConceptId = 'C01' | 'C02' | 'C03' | 'C04' | 'C05' | 'C06' | 'C07' | 'C08';
export type Trail = 'water' | 'air' | 'coast';
export type SimId = 'SIM_EVAP' | 'SIM_CLOUD' | 'SIM_RAIN' | 'SIM_WIND' | 'SIM_BREEZE' | 'SIM_MOUNTAIN' | 'SIM_TIDE' | '3D_LANDFORM';
export type ControlValue = number | string | boolean;

export interface WordEntry { word: string; meaning: string; icon: string }
export interface ChoiceOption { id: string; icon?: string; text: string; short?: string }

export type ScriptStep =
  | { t: number; set: Record<string, ControlValue>; ease?: number }
  | { t: number; caption: string }
  | { t: number; hold: number };

export interface MisconceptionDef { id: string; text: string; parentLabel: string }
export type ExampleKind = 'home' | 'india' | 'world';

export interface NameItItem {
  kind: 'word' | 'picture' | 'wind_game';
  prompt: string;
  promptIcon?: string;
  promptIcons?: string[];
  promptSound?: string;
  options: string[];
  optionIcons?: string[];
  answer: number;
  target?: string;
}

export interface LabChallenge {
  id: string;
  type: 'reach_state' | 'is_it_possible';
  text: string;
  check?: string;
  answer?: 'yes' | 'no';
  reason?: string;
}

export interface Concept {
  id: ConceptId;
  title: string;
  subtitle: string | null;
  short: string;
  trail: Trail;
  needs: ConceptId[];
  icon: string;
  sim: SimId;
  seed: number;
  simParams?: Record<string, number>;
  words: WordEntry[];
  hook: { image: string; alt: string; icon: string; lines: string[] };
  predict: { question: string; options: ChoiceOption[]; answer: string };
  watch: {
    instruction: string;
    duration: number;
    script: ScriptStep[];
    captions: Record<string, string>;
    revealMatch?: string;
    revealMiss?: string;
  };
  explain: {
    question: string;
    correct: { id: string; text: string };
    misconceptions: MisconceptionDef[];
    examples: Record<ExampleKind, string>;
    highlight: { start: number; end: number; layer: string; caption: string };
  };
  nameIt: NameItItem[];
  twist: { question: string; options: ChoiceOption[]; answer: string; reason: string };
  faq: { q: string; a: string }[];
  knowledgePack: string;
  labChallenges: LabChallenge[];
  mission: { text: string; answers: { id: string; text: string }[]; debrief: string };
}

export interface DuelItem { id: string; kind: 'text' | 'sound'; text?: string; sound?: string; side: string; reason: string; concept?: ConceptId }
export interface DuelDeck {
  id: string; title: string; concept: ConceptId;
  sides: { id: string; label: string; icon: string }[];
  items: DuelItem[];
}

export type SceneElement =
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill: string; stroke?: string; r?: number; opacity?: number }
  | { t: 'poly'; pts: number[]; fill: string; stroke?: string }
  | { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill: string; stroke?: string }
  | { t: 'circle'; cx: number; cy: number; r: number; fill: string; stroke?: string }
  | { t: 'tri'; cx: number; by: number; w: number; h: number; fill: string }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string }
  | { t: 'arrow'; x1: number; y1: number; x2: number; y2: number; color: string }
  | { t: 'label'; x: number; y: number; text: string; anchor?: 'start' | 'middle' | 'end'; size?: number }
  | { t: 'icon'; name: string; x: number; y: number; size: number };

export type Clue =
  | { kind: 'photo'; icon: string; text: string }
  | { kind: 'note'; text: string }
  | { kind: 'witness'; who: string; text: string }
  | { kind: 'bars'; title: string; unit: string; bars: { label: string; value: number }[] }
  | { kind: 'tides'; title: string; rows: { label: string; time: string }[] }
  | { kind: 'thermos'; title: string; items: { label: string; value: number }[] };

export interface CaseQuestion { prompt: string; options: { id: string; text: string }[]; answer: string; reason?: string }
export interface CaseFile {
  id: string; number: number; title: string; needs: ConceptId[]; concepts: ConceptId[];
  map: { caption: string; elements: SceneElement[] };
  clues: Clue[];
  questions: CaseQuestion[];
  bigWhy: {
    prompt: string;
    keyIdeas: { id: string; required: boolean; text: string }[];
    watchFor: string[]; watchConcept: ConceptId;
    chips: { label: string; options: { id: string; text: string }[]; answer: string }[];
  };
  twist: CaseQuestion & { reason: string };
  reveal: { icon: string; text: string };
}

export interface Place {
  id: string; name: string; country: string; lat: number; lon: number;
  concepts: ConceptId[]; facts: { text: string; concept: ConceptId }[]; photo: string; icon: string;
}
export interface PlacesFile { places: Place[]; finds: { id: string; prompt: string; targets: string[] }[]; findRadiusKm: number }

// ---------- learning state
export type Level = 0 | 1 | 2 | 3 | 4;
export type ReviewKind = 'explain' | 'duel' | 'name';
export type AttemptKind = 'predict' | 'explain' | 'name' | 'twist' | 'duel' | 'review' | 'knowit';

export interface ConceptProgress {
  conceptId: ConceptId;
  level: Level;
  stopStep: number;               // steps finished (0..6); 6 = Stop finished once
  explainCorrectCount: number;
  lastExplainExample: ExampleKind | null;
  lastExplainAt: string | null;   // ISO UTC of the last first-try correct Explain (needed for the "1 day apart" rule)
  twistPassed: boolean;
  knowItLastTry: string | null;   // ISO UTC
  lastSeenAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;       // when stopStep first reached 6 (needed by nextStop's "not the last one finished" rule)
}

export interface ReviewState { conceptId: ConceptId; dueAt: string; intervalDays: number }
export interface Attempt {
  conceptId: ConceptId; kind: AttemptKind; itemId: string; choiceId: string;
  correct: boolean; firstTry: boolean; withHelp: boolean; misconceptionId: string | null; createdAt: string;
}
