import type { LogoGenerationOptions } from '../studio';
import {
  DEFAULT_MAGIK_LOGO_ART,
  DEFAULT_MAGIK_STYLE,
  LOGO_SUBTITLE_PRESETS,
  LOGO_STUDIO_STYLE_PRESETS,
  MAGIK_COLOR_PALETTES,
  MAGIK_LOGO_ART,
  type LogoSubtitlePreset,
} from './constants';
import { analyzeMagikName } from './name-parser';
import { normalizeMagikStyle } from './logo-style-presets';
import { randomLogoLighting } from './logo-lighting';
import { randomLogoMaterial } from './logo-materials';
import { randomLogoEffects } from './logo-effects';
import { applyLogoBackgroundSelection, randomLogoBackground } from './logo-backgrounds';
import { randomLogoCamera } from './logo-camera';
import { randomLogoDetails } from './logo-details';
import { randomLogoTypography } from './logo-typography';

const RANDOM_LOGO_NAMES = [
  'NeonWolf',
  'ShadowKing',
  'FirePhoenix',
  'CyberTitan',
  'GhostSniper',
  'DarkQueen',
  'StormRider',
  'VenomClan',
  'IceDragon',
  'BlazeHunter',
] as const;

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

export function subtitleToStyleHint(subtitle?: string): string | null {
  if (!subtitle?.trim()) return null;
  const map: Record<LogoSubtitlePreset, string> = {
    Gaming: 'Esports',
    Esports: 'Esports',
    Streamer: 'Neon',
    Clan: 'Dark',
    Creator: 'Premium',
  };
  const key = subtitle.trim() as LogoSubtitlePreset;
  if (LOGO_SUBTITLE_PRESETS.includes(key)) return map[key];
  return null;
}

/** Bereitet Formular für „Logo passend zum Namen“ vor. */
export function applyNameBasedLogoOptions(form: LogoGenerationOptions): LogoGenerationOptions {
  const name = form.logoName?.trim() ?? '';
  const analysis = analyzeMagikName(name);
  const subtitleStyle = subtitleToStyleHint(form.logoSubtitle);

  return {
    ...form,
    magikMode: 'name',
    magikCharacter: '',
    customCharacter: '',
    magikStyle: normalizeMagikStyle(subtitleStyle ?? analysis.suggestedStyle),
    ringLogoMode: analysis.suggestRing ? 'auto' : form.ringLogoMode ?? 'auto',
  };
}

/** Zufällige MAGIK-Einstellungen für „Zufälliges Logo“. */
export function buildRandomLogoOptions(form: LogoGenerationOptions): LogoGenerationOptions {
  const palette = pickRandom(MAGIK_COLOR_PALETTES);
  const art = pickRandom(MAGIK_LOGO_ART);
  const style = pickRandom(LOGO_STUDIO_STYLE_PRESETS);
  const name = form.logoName?.trim() || pickRandom(RANDOM_LOGO_NAMES);
  const subtitle = form.logoSubtitle?.trim() ? form.logoSubtitle : pickRandom(LOGO_SUBTITLE_PRESETS);

  const bgId = randomLogoBackground();
  const bgPatch = applyLogoBackgroundSelection(bgId, form);

  return {
    ...form,
    logoName: name,
    logoSubtitle: subtitle,
    magikMode: 'name',
    magikCharacter: '',
    customCharacter: '',
    magikStyle: style,
    magikLogoArt: art.id,
    ringLogoMode: pickRandom(['auto', 'yes', 'no'] as const),
    ...bgPatch,
    primaryColor: palette.colors[0],
    secondaryColor: palette.colors[1],
    accentColor: palette.colors[2],
    glowColor: palette.colors[2],
    backgroundColor: palette.colors[1],
    logoGradientEnabled: Math.random() > 0.5,
    logoGradientFrom: palette.colors[0],
    logoGradientTo: palette.colors[1],
    logoGradientAngle: pickRandom([90, 135, 180, 225] as const),
    logoLighting: randomLogoLighting(),
    logoMaterial: randomLogoMaterial(),
    logoMaterialIntensity: Math.floor(Math.random() * 61) + 40,
    logoEffects: randomLogoEffects(),
    logoCamera: randomLogoCamera(),
    logoDetails: randomLogoDetails(),
    logoTypography: randomLogoTypography(),
    selectedColors: [...palette.colors, palette.colors[2]!, palette.colors[1]!],
    customPromptOverride: undefined,
  };
}

export { RANDOM_LOGO_NAMES };
