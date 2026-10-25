// Parent PIN storage: salted SHA-256 in SecureStore. The PIN itself is never stored.
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { afterRight, afterWrong, freshPinState, isValidPin, lockedMinutes, type PinState } from './pinlock';

const K_SALT = 'parent_pin_salt';
const K_HASH = 'parent_pin_hash';
const K_STATE = 'parent_pin_state';

async function hashPin(salt: string, pin: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}
const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export async function hasPin(): Promise<boolean> {
  try { return !!(await SecureStore.getItemAsync(K_HASH)); } catch { return false; }
}

export async function setPin(pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error('PIN must be 4 digits');
  const salt = toHex(Crypto.getRandomBytes(16));
  await SecureStore.setItemAsync(K_SALT, salt);
  await SecureStore.setItemAsync(K_HASH, await hashPin(salt, pin));
  await SecureStore.setItemAsync(K_STATE, JSON.stringify(freshPinState()));
}

async function readState(): Promise<PinState> {
  try { const raw = await SecureStore.getItemAsync(K_STATE); if (raw) return { ...freshPinState(), ...JSON.parse(raw) }; } catch { /* fall through */ }
  return freshPinState();
}
const writeState = (s: PinState) => SecureStore.setItemAsync(K_STATE, JSON.stringify(s)).catch(() => {});

export async function pinLockMinutes(now = Date.now()): Promise<number> { return lockedMinutes(await readState(), now); }

export type PinResult = { ok: true } | { ok: false; lockedMinutes: number; triesLeft: number };

export async function verifyPin(pin: string, now = Date.now()): Promise<PinResult> {
  const st = await readState();
  const lm = lockedMinutes(st, now);
  if (lm > 0) return { ok: false, lockedMinutes: lm, triesLeft: 0 };
  const [salt, hash] = await Promise.all([SecureStore.getItemAsync(K_SALT), SecureStore.getItemAsync(K_HASH)]);
  if (salt && hash && (await hashPin(salt, pin)) === hash) { await writeState(afterRight()); return { ok: true }; }
  const next = afterWrong(st, now);
  await writeState(next);
  return { ok: false, lockedMinutes: lockedMinutes(next, now), triesLeft: Math.max(0, 5 - next.fails) };
}
