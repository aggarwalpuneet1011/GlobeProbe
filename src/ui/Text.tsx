import React from 'react';
import { Text as RNText, type TextProps } from 'react-native';
import { C, TYPE, type TextVariant } from './theme';

export interface AppTextProps extends TextProps { v?: TextVariant; color?: string; center?: boolean }
/** Every piece of text goes through here so fonts, sizes (min 14 sp) and font scaling (cap 1.3x) stay consistent. */
export function T({ v = 'body', color = C.ink, center, style, ...rest }: AppTextProps) {
  return <RNText maxFontSizeMultiplier={1.3} {...rest} style={[TYPE[v], { color }, center && { textAlign: 'center' }, style]} />;
}
