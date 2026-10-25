// Text to speech: en-IN, pitch 1.1, rate 1.0 (Parent setting 0.85 / 1.0 / 1.15). Prefer a female en-IN voice.
import * as Speech from 'expo-speech';

let voiceId: string | undefined;
let voiceChecked = false;
let voiceAvailable = true;

async function pickVoice() {
  if (voiceChecked) return;
  voiceChecked = true;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    if (!voices.length) { voiceAvailable = false; return; }
    const inIN = voices.filter((v) => v.language?.toLowerCase().replace('_', '-') === 'en-in');
    const female = inIN.find((v) => /female|(\bf\b)|-f-|x-ahp|x-tfc|sfg|iob|iog/i.test(`${v.name} ${v.identifier}`));
    voiceId = (female ?? inIN[0])?.identifier;
    const anyEnglish = voices.some((v) => v.language?.toLowerCase().startsWith('en'));
    voiceAvailable = anyEnglish || inIN.length > 0;
  } catch { voiceAvailable = false; }
}

/** False when the device has no usable voice: callers hide the speaker icons. */
export async function voiceReady(): Promise<boolean> { await pickVoice(); return voiceAvailable; }

export async function speak(text: string, rate = 1.0, onDone?: () => void) {
  await pickVoice();
  if (!voiceAvailable || !text) { onDone?.(); return; }
  try {
    Speech.stop();
    Speech.speak(text, { language: 'en-IN', voice: voiceId, pitch: 1.1, rate, onDone, onStopped: onDone, onError: () => onDone?.() });
  } catch { onDone?.(); }
}
export function stopSpeaking() { try { Speech.stop(); } catch { /* ignore */ } }
