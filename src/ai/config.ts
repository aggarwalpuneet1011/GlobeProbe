// The one place the model name lives.
// Verified 25 Oct 2026 on ai.google.dev (models and deprecations pages): all three are Stable with no shutdown date announced.
// The first is the default. If a model answers 404 the next one is tried, and the one that worked is remembered.
export const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'] as const;
export type GeminiModel = (typeof GEMINI_MODELS)[number];
export const GEMINI_MODEL: GeminiModel = GEMINI_MODELS[0];
export const MODEL_LABELS: Record<GeminiModel, string> = { 'gemini-3.8-flash': '3.8 Flash', 'gemini-3.6-flash': '3.6 Flash', 'gemini-3.5-flash-lite': '3.5 Flash-Lite' };
export const GEMINI_HOST = 'https://generativelanguage.googleapis.com';
export const modelUrl = (m: string) => `${GEMINI_HOST}/v1beta/models/${m}:generateContent`;
export const GEMINI_URL = modelUrl(GEMINI_MODEL);
export const MODEL_PREF_KEY = 'gemini_model';
/** Preferred model first, then the others in default order, no repeats. Unknown names are ignored. */
export function modelOrder(preferred?: string | null): GeminiModel[] {
  const first = (GEMINI_MODELS as readonly string[]).includes(preferred ?? '') ? (preferred as GeminiModel) : GEMINI_MODEL;
  return [first, ...GEMINI_MODELS.filter((m) => m !== first)];
}
export const TEMPERATURE = 0.3;
/**
 * The first design budgeted 400. Flash models spend part of this budget on thinking tokens, so 400 can truncate a 60-word JSON answer.
 * 1024 with thinkingLevel "low" keeps replies short and complete.
 */
export const MAX_OUTPUT_TOKENS = 1024;
export const THINKING_LEVEL = 'low';
export const TIMEOUT_MS = 15000;
export const AUDIO_MIME = 'audio/m4a';
export const AUDIO_MIME_FALLBACK = 'audio/mp4';
export const MAX_QUESTION_CHARS = 140;
export const SECURE_KEY_NAME = 'gemini_api_key';

export const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
];
