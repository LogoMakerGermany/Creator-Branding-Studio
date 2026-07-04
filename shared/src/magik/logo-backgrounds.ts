import type { LogoGenerationOptions } from '../studio';

export const LOGO_STUDIO_BACKGROUND_PRESETS = [
  { id: 'transparent', label: 'Transparent', promptPhrase: 'transparent background, isolated logo, alpha channel ready' },
  { id: 'black', label: 'Schwarz', promptPhrase: 'pure black background with subtle vignette' },
  { id: 'gradient', label: 'Farbverlauf', promptPhrase: 'smooth cinematic color gradient background' },
  { id: 'galaxy', label: 'Galaxy', promptPhrase: 'galaxy nebula cosmic starfield background' },
  { id: 'fog', label: 'Nebel', promptPhrase: 'mysterious fog mist atmospheric background' },
  { id: 'fire', label: 'Feuer', promptPhrase: 'fiery inferno background with embers and heat' },
  { id: 'ice', label: 'Eis', promptPhrase: 'frozen ice crystal cold mist background' },
  { id: 'city', label: 'Stadt', promptPhrase: 'cyber city skyline urban night background' },
  { id: 'forest', label: 'Wald', promptPhrase: 'dark enchanted forest atmospheric background' },
  { id: 'sky', label: 'Himmel', promptPhrase: 'dramatic sky clouds sunset background' },
  { id: 'hell', label: 'Hölle', promptPhrase: 'hellish lava apocalyptic underworld background' },
  { id: 'space', label: 'Weltraum', promptPhrase: 'deep space nebula stars cosmic background' },
] as const;

export type LogoStudioBackgroundId = (typeof LOGO_STUDIO_BACKGROUND_PRESETS)[number]['id'] | 'custom';

const PRESET_BY_ID = Object.fromEntries(LOGO_STUDIO_BACKGROUND_PRESETS.map((b) => [b.id, b])) as Record<
  (typeof LOGO_STUDIO_BACKGROUND_PRESETS)[number]['id'],
  (typeof LOGO_STUDIO_BACKGROUND_PRESETS)[number]
>;

/** Legacy magikBackground mapping für Backend-Kompatibilität */
const TO_MAGIK_BACKGROUND: Record<LogoStudioBackgroundId, string> = {
  transparent: 'transparent',
  black: 'dark',
  gradient: 'abstract',
  galaxy: 'space',
  fog: 'fog',
  fire: 'fire',
  ice: 'ice',
  city: 'ruins',
  forest: 'abstract',
  sky: 'abstract',
  hell: 'fire',
  space: 'space',
  custom: 'abstract',
};

export const DEFAULT_LOGO_BACKGROUND: LogoStudioBackgroundId = 'transparent';

export function resolveLogoBackground(opts: LogoGenerationOptions): LogoStudioBackgroundId {
  if (opts.logoBackgroundUpload?.trim()) return 'custom';
  const id = (opts.logoBackground ?? opts.magikBackground) as LogoStudioBackgroundId | undefined;
  if (id === 'custom' || (id && id in PRESET_BY_ID)) return id;
  if (id && TO_MAGIK_BACKGROUND[id as LogoStudioBackgroundId]) return id as LogoStudioBackgroundId;
  return DEFAULT_LOGO_BACKGROUND;
}

export function getLogoBackgroundPreset(id: Exclude<LogoStudioBackgroundId, 'custom'>) {
  return PRESET_BY_ID[id];
}

/** Form-Patch beim Wechsel des Hintergrunds */
export function applyLogoBackgroundSelection(
  id: LogoStudioBackgroundId,
  form: LogoGenerationOptions
): Partial<LogoGenerationOptions> {
  const patch: Partial<LogoGenerationOptions> = {
    logoBackground: id,
    magikBackground: TO_MAGIK_BACKGROUND[id] ?? 'dark',
    transparentBackground: id === 'transparent',
  };

  if (id === 'gradient') {
    patch.logoGradientEnabled = true;
    patch.logoGradientFrom = form.logoGradientFrom ?? form.primaryColor ?? '#22d3ee';
    patch.logoGradientTo = form.logoGradientTo ?? form.secondaryColor ?? '#a855f7';
  }

  if (id === 'black') {
    patch.backgroundColor = '#000000';
  }

  if (id !== 'custom') {
    patch.logoBackgroundUpload = undefined;
    patch.logoBackgroundUploadName = undefined;
  }

  return patch;
}

/** Hintergrund-Phrase für MAGIK Prompts */
export function buildLogoBackgroundPromptPhrase(opts: LogoGenerationOptions): string {
  const id = resolveLogoBackground(opts);

  if (id === 'custom' && opts.logoBackgroundUpload) {
    return 'custom uploaded background reference image integrated behind logo, match mood and colors harmoniously';
  }

  if (id === 'gradient' || (opts.logoGradientEnabled && opts.logoGradientFrom && opts.logoGradientTo)) {
    return `gradient background from ${opts.logoGradientFrom ?? opts.primaryColor} to ${opts.logoGradientTo ?? opts.secondaryColor}, cinematic backdrop`;
  }

  if (id === 'transparent' || opts.transparentBackground) {
    return PRESET_BY_ID.transparent.promptPhrase;
  }

  if (id in PRESET_BY_ID) {
    return PRESET_BY_ID[id as keyof typeof PRESET_BY_ID].promptPhrase;
  }

  return PRESET_BY_ID.transparent.promptPhrase;
}

export function randomLogoBackground(): LogoStudioBackgroundId {
  const pool = [...LOGO_STUDIO_BACKGROUND_PRESETS];
  return pool[Math.floor(Math.random() * pool.length)]!.id;
}

/** CSS für Live-Vorschau */
export function logoBackgroundPreviewStyle(
  id: LogoStudioBackgroundId,
  form: LogoGenerationOptions
): string | undefined {
  if (id === 'custom' && form.logoBackgroundUpload) {
    return `url(${form.logoBackgroundUpload}) center/cover no-repeat`;
  }
  switch (id) {
    case 'transparent':
      return undefined;
    case 'black':
      return '#000000';
    case 'gradient':
      return `linear-gradient(${form.logoGradientAngle ?? 135}deg, ${form.logoGradientFrom ?? '#22d3ee'}, ${form.logoGradientTo ?? '#a855f7'})`;
    case 'galaxy':
    case 'space':
      return 'radial-gradient(ellipse at 30% 20%, #4c1d95 0%, #0f172a 45%, #020617 100%)';
    case 'fog':
      return 'linear-gradient(180deg, #334155 0%, #1e293b 50%, #0f172a 100%)';
    case 'fire':
    case 'hell':
      return 'radial-gradient(circle at 50% 80%, #ef4444 0%, #7f1d1d 40%, #1c1917 100%)';
    case 'ice':
      return 'linear-gradient(160deg, #bae6fd 0%, #38bdf8 35%, #0c4a6e 100%)';
    case 'city':
      return 'linear-gradient(180deg, #1e1b4b 0%, #312e81 40%, #0f172a 100%)';
    case 'forest':
      return 'linear-gradient(180deg, #14532d 0%, #052e16 50%, #022c22 100%)';
    case 'sky':
      return 'linear-gradient(180deg, #38bdf8 0%, #818cf8 45%, #1e3a8a 100%)';
    default:
      return form.backgroundColor ?? '#0b0f14';
  }
}
