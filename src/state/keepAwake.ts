// Keeps the screen on (parent request). Two holds: the app while it is in the foreground (a Parent Zone switch,
// default on) and every Gemini request (always, so a slow answer never meets a dark screen).
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

const held = new Map<string, number>();

export async function holdAwake(tag: string): Promise<() => void> {
  const n = (held.get(tag) ?? 0) + 1;
  held.set(tag, n);
  if (n === 1) { try { await activateKeepAwakeAsync(tag); } catch { /* no activity yet: ignore */ } }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const left = (held.get(tag) ?? 1) - 1;
    if (left <= 0) { held.delete(tag); try { void deactivateKeepAwake(tag); } catch { /* ignore */ } } else held.set(tag, left);
  };
}
