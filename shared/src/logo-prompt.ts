export type { LogoDnaContext } from './magik/prompt-engine';
export {
  collectMagikColors as collectLogoColors,
  validateMagikLogoOptions as validateLogoGenerationOptions,
  isMagikFormValid as isLogoFormValid,
  buildLogoPrompt,
  buildMagikLogoPrompts,
  buildMagikLogoPrompt,
} from './magik/prompt-engine';
export {
  MAGIK_GAME_PRESETS,
  MAGIK_STYLE_PRESETS,
  MAGIK_LOGO_ART,
  MAGIK_RING_MODES,
  MAGIK_BACKGROUND_PRESETS,
  MAGIK_CHARACTERS,
  MAGIK_COLOR_PALETTES,
  DEFAULT_MAGIK_STYLE,
  DEFAULT_MAGIK_LOGO_ART,
} from './magik/constants';
export { analyzeMagikName } from './magik/name-parser';

/** @deprecated Use MAGIK_CHARACTERS */
export const LOGO_SYMBOL_SUGGESTIONS = ['Wolf', 'Drache', 'Krone', 'Blitz', 'Schädel', 'Phönix'] as const;

/** @deprecated Use MAGIK_BACKGROUND_PRESETS */
export const LOGO_BACKGROUND_TYPES = [
  { id: 'transparent', label: 'Transparent' },
  { id: 'dark', label: 'Dunkel' },
] as const;

export type LogoValidationErrors = import('./magik/prompt-engine').MagikValidationErrors;
