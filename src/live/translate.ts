// Translating data for a child.
export const COMPASS8 = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'] as const;

/** wind_direction_10m is where the wind comes FROM. */
export function compass8(deg: number): (typeof COMPASS8)[number] {
  return COMPASS8[((Math.round(deg / 45) % 8) + 8) % 8];
}
const ABBR = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export const compassAbbr = (deg: number) => ABBR[((Math.round(deg / 45) % 8) + 8) % 8];

export type SeaLand = 'sea' | 'land' | 'coast';
/** Mumbai: degrees in [180, 315] come from the sea; [0, 135] from the land; else along the coast. */
export function seaLand(deg: number): SeaLand {
  const d = ((deg % 360) + 360) % 360;
  if (d >= 180 && d <= 315) return 'sea';
  if (d >= 0 && d <= 135) return 'land';
  return 'coast';
}
export const SEA_LAND_WORDS: Record<SeaLand, string> = { sea: 'from the sea', land: 'from the land', coast: 'along the coast' };

export function windFromLine(deg: number): string {
  const sl = seaLand(deg);
  return `Wind from the ${compass8(deg)}${sl === 'coast' ? ', along the coast' : `, ${SEA_LAND_WORDS[sl]}`}`;
}

export function windStrengthWord(kmh: number): string {
  if (kmh < 6) return 'barely a breath';
  if (kmh < 20) return 'a gentle breeze';
  if (kmh < 39) return 'a strong breeze';
  return 'very windy';
}

/** Local (IST) hour 0..23. Sea breeze: 11..18, from the sea, >= 6 km/h. Land breeze: 22..6, from the land. */
export function breezeLine(hour: number, deg: number, kmh: number): string | null {
  const sl = seaLand(deg);
  if (hour >= 11 && hour <= 18 && sl === 'sea' && kmh >= 6) return 'Sea breeze is on';
  if ((hour >= 22 || hour <= 6) && sl === 'land') return 'Land breeze is on';
  return null;
}

export interface WeatherWord { word: string; icon: string; kind: 'clear' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'storm' }
export function weatherWord(code: number): WeatherWord | null {
  if (code === 0) return { word: 'sunny', icon: 'sunny', kind: 'clear' };
  if (code === 1 || code === 2) return { word: 'a few clouds', icon: 'cloudy', kind: 'cloud' };
  if (code === 3) return { word: 'cloudy', icon: 'cloudy', kind: 'cloud' };
  if (code === 45 || code === 48) return { word: 'fog', icon: 'fog', kind: 'fog' };
  if ([51, 53, 55, 56, 57].includes(code)) return { word: 'drizzle', icon: 'drizzle', kind: 'drizzle' };
  if (code === 61 || code === 63) return { word: 'rain', icon: 'rain', kind: 'rain' };
  if (code === 65) return { word: 'heavy rain', icon: 'rain', kind: 'rain' };
  if (code === 80 || code === 81) return { word: 'showers', icon: 'rain', kind: 'rain' };
  if (code === 82) return { word: 'downpour', icon: 'downpour', kind: 'rain' };
  if (code === 95 || code === 96 || code === 99) return { word: 'thunderstorm', icon: 'thunderstorm', kind: 'storm' };
  return null; // anything else: hide the word
}

/** For the Home greeting: is it drizzling or raining in Mumbai right now? */
export function rainNowFromCode(code: number | null | undefined): 'drizzle' | 'rain' | null {
  if (code == null) return null;
  const w = weatherWord(code);
  if (!w) return null;
  if (w.kind === 'drizzle') return 'drizzle';
  if (w.kind === 'rain' || w.kind === 'storm') return 'rain';
  return null;
}

/** Rain amount words (mm in a day). */
export function rainAmountWord(mm: number): string {
  if (mm <= 0) return 'no rain';
  if (mm < 2.5) return 'a little';
  if (mm < 15) return 'some';
  if (mm < 64) return 'heavy';
  return 'very heavy';
}
