// Gemini REST client without React Native imports: fetch is injected so every path is unit-tested offline.
import { AUDIO_MIME, AUDIO_MIME_FALLBACK, GEMINI_URL, MAX_OUTPUT_TOKENS, modelUrl, SAFETY_SETTINGS, TEMPERATURE, THINKING_LEVEL, TIMEOUT_MS } from './config';
import { AiError, RETRYABLE, type AiErrorType } from './errors';

export interface AudioInput { base64: string; mime?: string }
export interface CallOptions {
  key: string;
  system: string;
  payload: unknown;                 // sent as JSON text
  schema: unknown;
  audio?: AudioInput;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  onStage?: (s: 'sending' | 'receiving' | 'validating') => void;
  url?: string;                     // test override; disables the model chain
  models?: string[];                // tried in order when one answers 404 (default: the single GEMINI_URL)
  onModel?: (model: string) => void; // called with the model that answered
  timeoutMs?: number;
  maxOutputTokens?: number;
}

interface BodyOpts { thinking: boolean; mime: string }
export function buildBody(o: CallOptions, b: BodyOpts) {
  const parts: unknown[] = [{ text: typeof o.payload === 'string' ? o.payload : JSON.stringify(o.payload) }];
  if (o.audio) parts.push({ inline_data: { mime_type: b.mime, data: o.audio.base64 } });
  return {
    systemInstruction: { parts: [{ text: o.system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: o.schema,
      temperature: TEMPERATURE,
      maxOutputTokens: o.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
      ...(b.thinking ? { thinkingConfig: { thinkingLevel: THINKING_LEVEL } } : {}),
    },
    safetySettings: SAFETY_SETTINGS,
  };
}

/** Map an HTTP failure to the taxonomy. `bodyText` is used to tell a bad key (400 API_KEY_INVALID) from a bad request. */
export function classifyHttp(status: number, bodyText: string): AiErrorType {
  const t = bodyText.toLowerCase();
  if (status === 401 || status === 403) return 'BAD_KEY';
  if (status === 400 && (t.includes('api_key_invalid') || t.includes('api key not valid') || t.includes('api key expired'))) return 'BAD_KEY';
  if (status === 404) return 'MODEL_404';
  if (status === 429) return 'RATE_LIMIT';
  if (status >= 500) return 'SERVER';
  return 'BAD_REQUEST';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractJson(resp: any): unknown {
  if (resp?.promptFeedback?.blockReason) throw new AiError('BLOCKED');
  const cand = resp?.candidates?.[0];
  if (!cand) throw new AiError('VALIDATION', 'no candidates');
  const reason = cand.finishReason;
  if (reason === 'SAFETY' || reason === 'PROHIBITED_CONTENT' || reason === 'BLOCKLIST' || reason === 'SPII') throw new AiError('BLOCKED');
  if (reason === 'MAX_TOKENS') throw new AiError('TRUNCATED');
  const text: string | undefined = cand.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('');
  if (!text) throw new AiError('VALIDATION', 'empty');
  try { return JSON.parse(text); } catch { throw new AiError('VALIDATION', 'not json'); }
}

async function once(o: CallOptions, b: BodyOpts, url: string): Promise<unknown> {
  const f = o.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (o.signal) { if (o.signal.aborted) throw new AiError('CANCELLED'); o.signal.addEventListener('abort', onAbort); }
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, o.timeoutMs ?? TIMEOUT_MS);
  try {
    o.onStage?.('sending');
    let res: Response;
    try {
      res = await f(url, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': o.key },
        body: JSON.stringify(buildBody(o, b)),
      });
    } catch (e) {
      if (o.signal?.aborted) throw new AiError('CANCELLED');
      if (timedOut) throw new AiError('NETWORK', 'timeout');
      if (e instanceof AiError) throw e;
      throw new AiError('NETWORK');
    }
    o.onStage?.('receiving');
    if (!res.ok) {
      let text = '';
      try { text = await res.text(); } catch { /* ignore */ }
      throw new AiError(classifyHttp(res.status, text), `http ${res.status}`);
    }
    let json: unknown;
    try { json = await res.json(); } catch { throw new AiError('VALIDATION', 'bad body'); }
    o.onStage?.('validating');
    return extractJson(json);
  } finally {
    clearTimeout(timer);
    o.signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * One call with the retry policy (plus a step down the model chain on 404): a single retry on network error or 5xx (and on a validation miss).
 * A 400 that mentions thinking is retried once without thinkingConfig; with audio attached a 400 is retried with a fallback MIME type.
 */
export async function callGemini(o: CallOptions): Promise<unknown> {
  if (!o.key) throw new AiError('NO_KEY');
  let thinking = true;
  let mime = o.audio?.mime ?? AUDIO_MIME;
  let triedNoThinking = false; let triedMime = false; let retried = false;
  const chain = o.url || !o.models?.length ? null : o.models;
  let mi = 0;
  for (;;) {
    const url = o.url ?? (chain ? modelUrl(chain[mi]) : GEMINI_URL);
    try {
      const out = await once(o, { thinking, mime }, url);
      if (chain) o.onModel?.(chain[mi]);
      return out;
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError('NETWORK');
      if (err.type === 'MODEL_404' && chain && mi < chain.length - 1) { mi++; continue; }
      if (err.type === 'BAD_REQUEST') {
        if (thinking && !triedNoThinking) { thinking = false; triedNoThinking = true; continue; }
        if (o.audio && !triedMime && mime !== AUDIO_MIME_FALLBACK) { mime = AUDIO_MIME_FALLBACK; triedMime = true; continue; }
      }
      if (RETRYABLE.includes(err.type) && !retried) { retried = true; continue; }
      throw err;
    }
  }
}
