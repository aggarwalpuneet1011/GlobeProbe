// Design tokens. Warm cream paper, ink outlines, chunky solid shadows. Never red for wrong answers.
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const C = {
  cream: '#FFF8EC', paper: '#FFFFFF', ink: '#1F2A37', ink2: '#4A5565',
  coral: '#FF6B4A', coralShadow: '#B4442D',
  sea: '#1E88C7', seaShadow: '#0B5F94',
  sky: '#BFE6FF',
  green: '#3FAE5A', greenDark: '#2B8A44',
  ochre: '#D9A25B', ochreDark: '#B07A35',
  sand: '#F3D9A4', sun: '#FFC23D', warm: '#F28C38',
  cool: '#4FA3E0', coolFill: '#9CCBEF',
  raincloud: '#8A9BB0', stone: '#9AA5B1',
  night: '#5B5FC7', nightSky: '#2E3470', nudge: '#F2B134',
  todo: '#E4DCCB', selectedFill: '#EAF5FD',
  shadowSoft: 'rgba(31,42,55,0.18)',
} as const;

export const SP = { unit: 8, side: 20, gap: 16, border: 2 } as const;
export const R = { card: 24, choice: 20, bubble: 20, sheet: 28, pill: 999 } as const;
export const TOUCH = 56;

export const FONT = {
  baloo800: 'Baloo2_800ExtraBold', baloo700: 'Baloo2_700Bold',
  nunito600: 'Nunito_600SemiBold', nunito700: 'Nunito_700Bold',
} as const;

export type TextVariant = 'display' | 'h1' | 'h2' | 'body' | 'choice' | 'label' | 'button';
export const TYPE: Record<TextVariant, TextStyle> = {
  display: { fontFamily: FONT.baloo800, fontSize: 32, lineHeight: 36 },
  h1: { fontFamily: FONT.baloo800, fontSize: 24, lineHeight: 28 },
  h2: { fontFamily: FONT.baloo700, fontSize: 20, lineHeight: 24 },
  body: { fontFamily: FONT.nunito600, fontSize: 17, lineHeight: 24 },
  choice: { fontFamily: FONT.nunito700, fontSize: 17, lineHeight: 22 },
  label: { fontFamily: FONT.nunito700, fontSize: 14, lineHeight: 18 },
  button: { fontFamily: FONT.baloo800, fontSize: 19, lineHeight: 22 },
};

/** Solid offset shadow: a copy of the shape below it, never a blur. */
export const cardShadow: ViewStyle = Platform.select({ default: {} }) ?? {};

export const SHADOW_OFFSET = 4;

export const BINDU_COLOURS: Record<string, string> = { blue: '#4FA3E0', teal: '#2BB3A3', purple: '#8E7CE0', coral: '#FF8A6B' };
export const bubbleColour = (name: string) => BINDU_COLOURS[name] ?? BINDU_COLOURS.blue;

export const TRAIL_COLOUR = { water: C.sea, air: C.warm, coast: C.sand } as const;

export const TAB_HEIGHT = 64;
