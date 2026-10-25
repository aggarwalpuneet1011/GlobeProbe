// The only file that touches the stored API key. The key is never logged and never shown in full.
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import type { CaseFile, Concept } from '../types';
import { holdAwake } from '../state/keepAwake';
import { callGemini, type AudioInput } from './core';
import { AiError, type AiErrorType } from './errors';
import { MAX_QUESTION_CHARS, MODEL_PREF_KEY, SECURE_KEY_NAME, modelOrder, type GeminiModel } from './config';
import { CASE_SCHEMA, KEY_TEST_SCHEMA, WHY_SCHEMA } from './schemas';
import { CASE_SYSTEM, WHY_SYSTEM, KEY_TEST_PROMPT } from './prompts';
import { validateCase, validateWhy, type CaseResult, type WhyResult } from './validate';
import { casePayload, caseMisconceptions, whyPayload } from './payloads';

export type AiResult<T> = { ok: true; data: T } | { ok: false; error: AiErrorType };

export async function getKey(): Promise<string | null> {
  try { return (await SecureStore.getItemAsync(SECURE_KEY_NAME)) || null; } catch { return null; }
}
export async function setKey(key: string): Promise<void> { await SecureStore.setItemAsync(SECURE_KEY_NAME, key.trim()); }
export async function removeKey(): Promise<void> { try { await SecureStore.deleteItemAsync(SECURE_KEY_NAME); } catch { /* nothing stored */ } }
export async function hasKey(): Promise<boolean> { return !!(await getKey()); }
/** "..." plus the last four characters, for display in the Parent Zone. */
export async function keyHint(): Promise<string | null> {
  const k = await getKey();
  return k ? '••••••••' + k.slice(-4) : null;
}

/** Preferred model (not a secret, but kept beside the key so this file stays the only place that touches AI storage). */
export async function getModel(): Promise<GeminiModel> {
  try { return modelOrder(await SecureStore.getItemAsync(MODEL_PREF_KEY))[0]; } catch { return modelOrder(null)[0]; }
}
export async function setModel(m: GeminiModel): Promise<void> { try { await SecureStore.setItemAsync(MODEL_PREF_KEY, m); } catch { /* keep the old one */ } }
async function chain(): Promise<string[]> {
  try { return modelOrder(await SecureStore.getItemAsync(MODEL_PREF_KEY)); } catch { return modelOrder(null); }
}
/** When a later model answered because an earlier one 404'd, start there next time. */
const remember = (first: string) => (m: string) => { if (m !== first) void SecureStore.setItemAsync(MODEL_PREF_KEY, m).catch(() => {}); };

export async function readAudio(uri: string): Promise<AudioInput> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return { base64 };
}

async function run<T>(fn: (key: string) => Promise<T>): Promise<AiResult<T>> {
  const key = await getKey();
  if (!key) return { ok: false, error: 'NO_KEY' };
  const release = await holdAwake('gemini');
  try { return { ok: true, data: await fn(key) }; }
  catch (e) { return { ok: false, error: e instanceof AiError ? e.type : 'NETWORK' }; }
  finally { release(); }
}

export interface AskOpts { signal?: AbortSignal; audio?: AudioInput; onStage?: (s: 'sending' | 'receiving' | 'validating') => void }

/** Why? answer. Typed questions are capped at 140 characters; a spoken one sends the audio and "(spoken, see audio)". */
export function askWhy(concept: Concept, rank: string, question: string, o: AskOpts = {}): Promise<AiResult<WhyResult>> {
  const q = o.audio ? '(spoken, see audio)' : question.slice(0, MAX_QUESTION_CHARS);
  return run(async (key) => {
    const models = await chain();
    const raw = await callGemini({ key, models, onModel: remember(models[0]), system: WHY_SYSTEM, payload: whyPayload(concept, rank, q), schema: WHY_SCHEMA, audio: o.audio, signal: o.signal, onStage: o.onStage });
    return validateWhy(raw, concept.title);
  });
}

/** Case Big Why scoring from typed text or audio. No name, no profile data. */
export function scoreCase(c: CaseFile, answerText: string, o: AskOpts = {}): Promise<AiResult<CaseResult>> {
  const text = o.audio ? '(spoken, see audio)' : answerText.slice(0, 1200);
  return run(async (key) => {
    const models = await chain();
    const raw = await callGemini({ key, models, onModel: remember(models[0]), system: CASE_SYSTEM, payload: casePayload(c, text), schema: CASE_SCHEMA, audio: o.audio, signal: o.signal, onStage: o.onStage });
    return validateCase(raw, c.bigWhy.keyIdeas.map((k) => k.id), caseMisconceptions(c).map((m) => m.id));
  });
}

/** "Test key": a 1-token request. Pass a key to test it before saving. */
export async function testKey(key?: string): Promise<AiResult<true>> {
  const k = key ?? (await getKey());
  if (!k) return { ok: false, error: 'NO_KEY' };
  const release = await holdAwake('gemini');
  try {
    const models = await chain();
    await callGemini({ key: k, models, onModel: remember(models[0]), system: 'Reply with the single word OK in the reply field.', payload: KEY_TEST_PROMPT, schema: KEY_TEST_SCHEMA, maxOutputTokens: 64 });
    return { ok: true, data: true };
  } catch (e) { return { ok: false, error: e instanceof AiError ? e.type : 'NETWORK' }; }
  finally { release(); }
}
