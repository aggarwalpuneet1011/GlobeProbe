// Fixed error taxonomy. The child never sees these: every failure falls back silently. The parent sees them in Settings.
export type AiErrorType =
  | 'NETWORK' | 'SERVER' | 'BAD_KEY' | 'NO_KEY' | 'MODEL_404' | 'RATE_LIMIT' | 'BLOCKED' | 'TRUNCATED' | 'VALIDATION' | 'CANCELLED' | 'BAD_REQUEST';

export class AiError extends Error {
  constructor(public type: AiErrorType, message: string = type) { super(message); this.name = 'AiError'; }
}

/** Calm, parent-facing copy per type (shown only in Parent Zone). */
export const PARENT_COPY: Record<AiErrorType, string> = {
  NETWORK: "Couldn't reach Gemini. Check the internet connection.",
  SERVER: 'Gemini had a hiccup. Try again in a moment.',
  BAD_KEY: "That key didn't work. Check it and try again.",
  NO_KEY: 'No Gemini key is set.',
  MODEL_404: 'None of the AI models this app knows about answered. The app needs an update.',
  RATE_LIMIT: 'Too many requests at once. Try again in a minute.',
  BLOCKED: 'That request was held back by the safety filter.',
  TRUNCATED: 'The reply was cut short. Try again.',
  VALIDATION: 'The reply was not in the expected shape. Try again.',
  CANCELLED: '',
  BAD_REQUEST: 'The request was rejected. The app may need an update.',
};

/** Types worth one silent retry. Never auth, quota, safety or cancellation. */
export const RETRYABLE: AiErrorType[] = ['NETWORK', 'SERVER', 'VALIDATION'];
