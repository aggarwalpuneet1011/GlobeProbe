// Parent PIN lockout rules: 5 wrong tries lock entry for 5 minutes. Pure, so it is unit tested.
export const MAX_TRIES = 5;
export const LOCK_MS = 5 * 60 * 1000;

export interface PinState { fails: number; lockUntil: number }
export const freshPinState = (): PinState => ({ fails: 0, lockUntil: 0 });

export function lockedMinutes(s: PinState, now: number): number {
  return s.lockUntil > now ? Math.ceil((s.lockUntil - now) / 60000) : 0;
}

/** State after a wrong PIN. The 5th wrong try starts the lock and resets the counter. */
export function afterWrong(s: PinState, now: number): PinState {
  if (lockedMinutes(s, now) > 0) return s;
  const fails = s.fails + 1;
  return fails >= MAX_TRIES ? { fails: 0, lockUntil: now + LOCK_MS } : { fails, lockUntil: 0 };
}
export const afterRight = (): PinState => freshPinState();
export const isValidPin = (pin: string) => /^\d{4}$/.test(pin);
