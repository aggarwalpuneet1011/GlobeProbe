// Home greeting: first matching rule wins. The name appears only in the morning line.
import { GREETINGS } from '../content/copy';
import { istParts } from '../util/time';

export interface GreetingContext {
  now: string;
  name?: string | null;
  /** From live Mumbai weather: 'drizzle' | 'rain' (rain includes downpour) or null. */
  rainNow: 'drizzle' | 'rain' | null;
  windFromDeg?: number | null;
  caseJustUnlocked: boolean;
}

export type GreetingKind = 'rain' | 'seaBreeze' | 'caseUnlocked' | 'morning' | 'afternoon' | 'evening';

export function seaBreezeNow(hour: number, windFromDeg: number | null | undefined): boolean {
  return windFromDeg != null && hour >= 12 && hour < 18 && windFromDeg >= 180 && windFromDeg <= 315;
}

export function pickGreeting(ctx: GreetingContext): { kind: GreetingKind; text: string } {
  const { hour } = istParts(ctx.now);
  if (ctx.rainNow) {
    return { kind: 'rain', text: GREETINGS.rain.replace('{drizzling/raining}', ctx.rainNow === 'drizzle' ? 'drizzling' : 'raining') };
  }
  if (seaBreezeNow(hour, ctx.windFromDeg)) return { kind: 'seaBreeze', text: GREETINGS.seaBreeze };
  if (ctx.caseJustUnlocked) return { kind: 'caseUnlocked', text: GREETINGS.caseUnlocked };
  if (hour >= 5 && hour < 12) {
    const n = ctx.name?.trim();
    return { kind: 'morning', text: n ? GREETINGS.morning.replace('{name}', n) : GREETINGS.morningNoName };
  }
  if (hour >= 12 && hour < 17) return { kind: 'afternoon', text: GREETINGS.afternoon };
  return { kind: 'evening', text: GREETINGS.evening };
}
