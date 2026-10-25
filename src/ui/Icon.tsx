import React from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';
import { CONCEPT_ICONS, UI_ICONS, type ConceptIconName, type UiIconName } from './assets';

export type IconName = ConceptIconName | UiIconName;
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Resolve an icon name from the content files to a bundled image. UI icons win over concept icons on a clash. */
export function iconSource(name: string | undefined | null): number | null {
  if (!name) return null;
  if (has(UI_ICONS, name)) return UI_ICONS[name as UiIconName] as number;
  if (has(CONCEPT_ICONS, name)) return CONCEPT_ICONS[name as ConceptIconName] as number;
  return null;
}
export const iconExists = (name: string) => has(UI_ICONS, name) || has(CONCEPT_ICONS, name);

export function Icon({ name, size = 48, style, label }: { name: string | undefined | null; size?: number; style?: StyleProp<ImageStyle>; label?: string }) {
  const src = iconSource(name);
  if (src == null) return null;
  return <Image source={src} style={[{ width: size, height: size }, style]} resizeMode="contain" accessibilityLabel={label} accessible={!!label} />;
}
