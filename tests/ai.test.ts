import { test, ok, eq, done } from './harness';
import { callGemini, buildBody, classifyHttp, extractJson } from '@/ai/core';
import { AiError } from '@/ai/errors';
import { validateWhy, validateCase, truncateAtSentence } from '@/ai/validate';
import { computeVerdict, chipVerdict } from '@/ai/verdict';
import { whyPayload, casePayload, caseMisconceptions } from '@/ai/payloads';
import { GEMINI_URL, GEMINI_MODEL, GEMINI_MODELS, modelOrder, AUDIO_MIME, MAX_OUTPUT_TOKENS } from '@/ai/config';
import { WHY_SYSTEM, CASE_SYSTEM, OFF_TOPIC, NOT_SURE } from '@/ai/prompts';
import { getConcept, getCase, CASES } from '@/content';

const goodWhy = { transcript: '', in_scope: true, answer: 'Rising air cools. Cool air cannot hold as much vapour, so droplets form. That is a cloud.', suggest_lab: true };
const okResp = (obj: unknown) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(obj) }] } }] });
const mkFetch = (script: (n: number, url: string, init: RequestInit) => { status: number; body: unknown } | Error) => {
  let n = 0; const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init }); const r = script(n++, url, init);
    if (r instanceof Error) throw r;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body) } as unknown as Response;
  }) as unknown as typeof fetch;
  return { f, calls };
};
const base = (f: typeof fetch) => ({ key: 'KEY1234', system: WHY_SYSTEM, payload: { q: 1 }, schema: {}, fetchImpl: f });

test('Request shape: URL, key header, JSON mode, schema, temperature 0.3, safety settings, no key in body', async () => {
  const { f, calls } = mkFetch(() => ({ status: 200, body: okResp(goodWhy) }));
  await callGemini(base(f));
  eq(calls[0].url, GEMINI_URL); ok(GEMINI_URL.includes(GEMINI_MODEL), 'model constant');
  const h = calls[0].init.headers as Record<string, string>; eq(h['x-goog-api-key'], 'KEY1234');
  const body = JSON.parse(calls[0].init.body as string);
  eq(body.generationConfig.responseMimeType, 'application/json'); eq(body.generationConfig.temperature, 0.3); eq(body.generationConfig.maxOutputTokens, MAX_OUTPUT_TOKENS);
  eq(body.safetySettings.length, 4); ok(!calls[0].init.body!.toString().includes('KEY1234'), 'key only in header'); ok(!calls[0].url.includes('KEY1234'), 'key not in URL');
});

test('Audio is attached as inline_data audio/m4a', () => {
  const b = buildBody({ ...base(fetch), audio: { base64: 'AAAA' } }, { thinking: true, mime: AUDIO_MIME }) as { contents: { parts: Record<string, unknown>[] }[] };
  eq(b.contents[0].parts[1], { inline_data: { mime_type: 'audio/m4a', data: 'AAAA' } });
});

test('HTTP classification', () => {
  eq(classifyHttp(401, ''), 'BAD_KEY'); eq(classifyHttp(403, ''), 'BAD_KEY'); eq(classifyHttp(400, '{"error":{"message":"API key not valid"}}'), 'BAD_KEY');
  eq(classifyHttp(404, ''), 'MODEL_404'); eq(classifyHttp(429, ''), 'RATE_LIMIT'); eq(classifyHttp(503, ''), 'SERVER'); eq(classifyHttp(400, 'bad'), 'BAD_REQUEST');
});

test('Response classification: blocked, truncated, empty, not JSON', () => {
  const t = (r: unknown) => { try { extractJson(r); return 'ok'; } catch (e) { return (e as AiError).type; } };
  eq(t({ promptFeedback: { blockReason: 'SAFETY' } }), 'BLOCKED'); eq(t({ candidates: [{ finishReason: 'SAFETY' }] }), 'BLOCKED');
  eq(t({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"a' }] } }] }), 'TRUNCATED');
  eq(t({ candidates: [] }), 'VALIDATION'); eq(t({ candidates: [{ content: { parts: [{ text: 'hello' }] } }] }), 'VALIDATION'); eq(t(okResp({ a: 1 })), 'ok');
});

test('Retry policy: one retry on network/5xx; none on 401/429/blocked; cancelled is never retried', async () => {
  let m = mkFetch((n) => (n === 0 ? new Error('net') : { status: 200, body: okResp(goodWhy) }));
  await callGemini(base(m.f)); eq(m.calls.length, 2);
  m = mkFetch((n) => (n === 0 ? { status: 503, body: {} } : { status: 200, body: okResp(goodWhy) }));
  await callGemini(base(m.f)); eq(m.calls.length, 2);
  m = mkFetch(() => ({ status: 503, body: {} }));
  try { await callGemini(base(m.f)); ok(false, 'should throw'); } catch (e) { eq((e as AiError).type, 'SERVER'); eq(m.calls.length, 2); }
  for (const [status, type] of [[401, 'BAD_KEY'], [429, 'RATE_LIMIT'], [404, 'MODEL_404']] as const) {
    m = mkFetch(() => ({ status, body: {} }));
    try { await callGemini(base(m.f)); ok(false, 'throw'); } catch (e) { eq((e as AiError).type, type); eq(m.calls.length, 1, String(status)); }
  }
  m = mkFetch(() => ({ status: 200, body: { promptFeedback: { blockReason: 'SAFETY' } } }));
  try { await callGemini(base(m.f)); ok(false, 'throw'); } catch (e) { eq((e as AiError).type, 'BLOCKED'); eq(m.calls.length, 1); }
  const ac = new AbortController(); ac.abort();
  m = mkFetch(() => ({ status: 200, body: okResp(goodWhy) }));
  try { await callGemini({ ...base(m.f), signal: ac.signal }); ok(false, 'throw'); } catch (e) { eq((e as AiError).type, 'CANCELLED'); eq(m.calls.length, 0); }
});

test('Abort mid-flight maps to CANCELLED with no retry', async () => {
  const ac = new AbortController(); let calls = 0;
  const f = ((_u: string, init: RequestInit) => { calls++; return new Promise((_, rej) => { init.signal!.addEventListener('abort', () => rej(new Error('aborted'))); setTimeout(() => ac.abort(), 5); }); }) as unknown as typeof fetch;
  try { await callGemini({ ...base(f), signal: ac.signal }); ok(false, 'throw'); } catch (e) { eq((e as AiError).type, 'CANCELLED'); eq(calls, 1); }
});

test('Timeout maps to NETWORK (and retries once)', async () => {
  let calls = 0;
  const f = ((_u: string, init: RequestInit) => { calls++; return new Promise((_, rej) => init.signal!.addEventListener('abort', () => rej(new Error('aborted')))); }) as unknown as typeof fetch;
  try { await callGemini({ ...base(f), timeoutMs: 20 }); ok(false, 'throw'); } catch (e) { eq((e as AiError).type, 'NETWORK'); eq(calls, 2); }
});

test('400 retries once without thinkingConfig; audio 400 retries with audio/mp4', async () => {
  let m = mkFetch((n) => (n === 0 ? { status: 400, body: { error: { message: 'Unknown name thinkingConfig' } } } : { status: 200, body: okResp(goodWhy) }));
  await callGemini(base(m.f)); eq(m.calls.length, 2);
  ok(JSON.parse(m.calls[0].init.body as string).generationConfig.thinkingConfig, 'first has thinking');
  eq(JSON.parse(m.calls[1].init.body as string).generationConfig.thinkingConfig, undefined);
  m = mkFetch((n) => (n < 2 ? { status: 400, body: { error: { message: 'bad mime' } } } : { status: 200, body: okResp(goodWhy) }));
  await callGemini({ ...base(m.f), audio: { base64: 'AA' } }); eq(m.calls.length, 3);
  eq(JSON.parse(m.calls[2].init.body as string).contents[0].parts[1].inline_data.mime_type, 'audio/mp4');
});

test('No key -> NO_KEY, nothing sent', async () => {
  const m = mkFetch(() => ({ status: 200, body: {} }));
  try { await callGemini({ ...base(m.f), key: '' }); ok(false, 'throw'); } catch (e) { eq((e as AiError).type, 'NO_KEY'); eq(m.calls.length, 0); }
});

test('Why validation: truncation at a sentence, off-topic and not-sure replies replaced by the fixed texts, banned words rejected', () => {
  const c = getConcept('C02');
  const long = 'Rising air cools down as it goes up. ' + 'Cool air holds less vapour so droplets form and these droplets make a cloud. '.repeat(6);
  const r = validateWhy({ transcript: '', in_scope: true, answer: long, suggest_lab: false }, c.title);
  ok(r.answer.split(/\s+/).length <= 60 && /[.!?]$/.test(r.answer), 'truncated: ' + r.answer);
  eq(validateWhy({ transcript: 'x', in_scope: false, answer: "That's a great question for a grown-up! Want to ask me something about stuff?" }, c.title).answer, OFF_TOPIC(c.title));
  eq(validateWhy({ transcript: '', in_scope: false, answer: 'whatever the model said' }, c.title).answer, NOT_SURE);
  eq(validateWhy({ ...goodWhy, in_scope: false, suggest_lab: true }, c.title).suggestLab, false);
  for (const bad of ['As an AI model I think...', 'Google says it is rain.', 'I read it on the internet.']) {
    try { validateWhy({ transcript: '', in_scope: true, answer: bad }, c.title); ok(false, 'throw ' + bad); } catch (e) { eq((e as AiError).type, 'VALIDATION'); }
  }
  for (const bad of [null, {}, { answer: 1 }, { transcript: '', in_scope: 'yes', answer: 'a' }]) {
    try { validateWhy(bad, c.title); ok(false, 'throw'); } catch (e) { eq((e as AiError).type, 'VALIDATION'); }
  }
  eq(truncateAtSentence('One. Two. Three. Four. Five.', 60, 3), 'One. Two. Three.');
});

test('Case validation: unknown ids dropped, feedback trimmed to 35 words, "wrong" never reaches the child', () => {
  const r = validateCase({ transcript: 'the hill pushes the air up', ideas_found: ['k1', 'k9', 'k1'], misconceptions_found: ['m_wall', 'zzz'], child_feedback: 'You are wrong about the wall. ' + 'Nice thinking about the climbing air. '.repeat(10), parent_note: 'Understood the climb.' }, ['k1', 'k2', 'k3'], ['m_wall']);
  eq(r.ideasFound, ['k1']); eq(r.misconceptionsFound, ['m_wall']); ok(r.childFeedback.split(/\s+/).length <= 35 && !/wrong/i.test(r.childFeedback), r.childFeedback);
  try { validateCase({ transcript: '' }, [], []); ok(false, 'throw'); } catch (e) { eq((e as AiError).type, 'VALIDATION'); }
});

const case1 = getCase('case1');
const ideas = case1.bigWhy.keyIdeas;
test('Verdict in code: solved / almost / not_yet; unknown ids ignored; twist gates "solved"', () => {
  eq(computeVerdict(ideas, ['k1', 'k2', 'k3'], [], true), 'solved');
  eq(computeVerdict(ideas, ['k1', 'k2', 'k3'], ['m_wall'], true), 'almost', 'misconception stated');
  eq(computeVerdict(ideas, ['k1'], [], true), 'almost');
  eq(computeVerdict(ideas, [], [], true), 'not_yet');
  eq(computeVerdict(ideas, ['k99'], [], true), 'not_yet', 'unknown id dropped');
  eq(computeVerdict(ideas, ['k1', 'k2', 'k3'], [], false), 'almost', 'twist missed');
  eq(computeVerdict([{ id: 'a', required: false }], ['a'], [], true), 'not_yet', 'no required ideas -> cannot solve');
});

test('Build-it chips: 3 = solved, 2 = almost, fewer = not yet; twist gates solved', () => {
  eq([3, 2, 1, 0].map((n) => chipVerdict(n, true)), ['solved', 'almost', 'not_yet', 'not_yet']); eq(chipVerdict(3, false), 'almost');
});

test('Payloads carry content only: no name/profile/location keys; case misconceptions resolve to texts', () => {
  const w = whyPayload(getConcept('C06'), 'Detective', 'Why is Pune dry?');
  eq(Object.keys(w).sort(), ['conceptId', 'conceptTitle', 'knowledgePack', 'question', 'rank', 'truthSheet']);
  ok(w.truthSheet.includes('Rain shadow'), 'truth sheet');
  for (const c of CASES) {
    const p = casePayload(c, 'x'); eq(Object.keys(p).sort(), ['answerText', 'caseId', 'caseSummary', 'keyIdeas', 'misconceptions']);
    eq(caseMisconceptions(c).length, c.bigWhy.watchFor.length, c.id + ' misconceptions resolve'); ok(p.caseSummary.length <= 900, 'summary size');
  }
  ok(WHY_SYSTEM.includes('Max 60 words') && CASE_SYSTEM.includes('Never say "wrong"'), 'system prompts verbatim');
});
test('Model chain: 404 steps to the next model, reports which one answered, stops after the last', async () => {
  const urls: string[] = []; let used = '';
  const m = mkFetch((n) => (n < 2 ? { status: 404, body: {} } : { status: 200, body: okResp(goodWhy) }));
  await callGemini({ ...base(m.f), models: modelOrder(null), onModel: (x) => { used = x; } });
  eq(m.calls.length, 3); eq(used, GEMINI_MODELS[2]);
  for (const c of m.calls) urls.push(c.url);
  ok(urls[0].includes(GEMINI_MODELS[0]) && urls[1].includes(GEMINI_MODELS[1]) && urls[2].includes(GEMINI_MODELS[2]), 'order');
  const all404 = mkFetch(() => ({ status: 404, body: {} }));
  try { await callGemini({ ...base(all404.f), models: modelOrder(null) }); ok(false, 'throw'); } catch (e) { eq((e as AiError).type, 'MODEL_404'); eq(all404.calls.length, 3); }
  const first = mkFetch(() => ({ status: 200, body: okResp(goodWhy) })); let seen = '';
  await callGemini({ ...base(first.f), models: modelOrder(GEMINI_MODELS[1]), onModel: (x) => { seen = x; } });
  eq(seen, GEMINI_MODELS[1]); eq(first.calls.length, 1);
});

test('modelOrder: preferred first, no repeats, unknown names fall back to the default', () => {
  eq(modelOrder(null)[0], GEMINI_MODEL); eq(modelOrder('nonsense')[0], GEMINI_MODEL);
  eq(modelOrder(GEMINI_MODELS[2]), [GEMINI_MODELS[2], GEMINI_MODELS[0], GEMINI_MODELS[1]]);
  eq(new Set(modelOrder(GEMINI_MODELS[1])).size, 3);
});

done();
