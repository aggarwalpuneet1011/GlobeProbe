// Sound effects: bundled OGG, global volume 70%, mute toggle. Ambience loops for rain.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { SOUND_FILES, type SoundId } from './assets';

const VOLUME = 0.7;
let enabled = true;
const players = new Map<SoundId, AudioPlayer>();
const loops = new Map<SoundId, AudioPlayer>();
let modeSet = false;

async function ensureMode() {
  if (modeSet) return;
  modeSet = true;
  try { await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }); } catch { /* ignore */ }
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (!on) stopAllLoops();
}
export const isSoundEnabled = () => enabled;

function playerFor(id: SoundId): AudioPlayer | null {
  try {
    let p = players.get(id);
    if (!p) { p = createAudioPlayer(SOUND_FILES[id]); p.volume = VOLUME; players.set(id, p); }
    return p;
  } catch { return null; }
}

export function playSfx(id: SoundId, volume = 1) {
  if (!enabled) return;
  void ensureMode();
  const p = playerFor(id);
  if (!p) return;
  try { p.volume = VOLUME * volume; void p.seekTo(0); p.play(); } catch { /* sound is never essential */ }
}

/** Start a looping ambience (rain, waves, wind). Safe to call repeatedly. */
export function startLoop(id: SoundId, volume = 1) {
  if (!enabled) return;
  void ensureMode();
  try {
    let p = loops.get(id);
    if (!p) { p = createAudioPlayer(SOUND_FILES[id]); p.loop = true; loops.set(id, p); }
    p.volume = VOLUME * volume;
    if (!p.playing) p.play();
  } catch { /* ignore */ }
}
export function setLoopVolume(id: SoundId, volume: number) {
  const p = loops.get(id);
  if (p) { try { p.volume = VOLUME * Math.max(0, Math.min(1, volume)); } catch { /* ignore */ } }
}
export function stopLoop(id: SoundId) {
  const p = loops.get(id);
  if (p) { try { p.pause(); } catch { /* ignore */ } }
}
export function stopAllLoops() { for (const id of Array.from(loops.keys())) stopLoop(id); }
