import type { LogoGenerationOptions } from '../studio';

export const LOGO_EFFECT_PRESETS = [
  { id: 'fire', label: 'Feuer', promptPhrase: 'fire flames embers and heat distortion' },
  { id: 'lightning', label: 'Blitze', promptPhrase: 'electric lightning bolts and energy arcs' },
  { id: 'smoke', label: 'Rauch', promptPhrase: 'volumetric smoke trails and haze' },
  { id: 'sparks', label: 'Funken', promptPhrase: 'flying sparks and ember particles' },
  { id: 'explosion', label: 'Explosion', promptPhrase: 'explosive shockwave burst and debris' },
  { id: 'snow', label: 'Schnee', promptPhrase: 'falling snowflakes and frost particles' },
  { id: 'rain', label: 'Regen', promptPhrase: 'rain droplets and wet atmospheric streaks' },
  { id: 'fog', label: 'Nebel', promptPhrase: 'mysterious fog mist and atmospheric depth' },
  { id: 'magic', label: 'Magie', promptPhrase: 'arcane magic runes and mystical aura' },
  { id: 'energy', label: 'Energie', promptPhrase: 'powerful energy waves and plasma pulses' },
  { id: 'water', label: 'Wasser', promptPhrase: 'water splash fluid dynamics and ripples' },
  { id: 'laser', label: 'Laser', promptPhrase: 'laser beams and sci-fi light streaks' },
  { id: 'particles', label: 'Partikel', promptPhrase: 'dense cinematic particle effects' },
] as const;

export type LogoEffectId = (typeof LOGO_EFFECT_PRESETS)[number]['id'];

const EFFECT_BY_ID = Object.fromEntries(LOGO_EFFECT_PRESETS.map((e) => [e.id, e])) as Record<
  LogoEffectId,
  (typeof LOGO_EFFECT_PRESETS)[number]
>;

export function resolveLogoEffects(opts: LogoGenerationOptions): LogoEffectId[] {
  const raw = opts.logoEffects ?? [];
  return raw.filter((id): id is LogoEffectId => id in EFFECT_BY_ID);
}

export function toggleLogoEffect(current: LogoEffectId[] | undefined, id: LogoEffectId): LogoEffectId[] {
  const list = (current ?? []) as LogoEffectId[];
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** Effekt-Phrase für MAGIK Prompts */
export function buildLogoEffectsPromptPhrase(opts: LogoGenerationOptions): string | null {
  const active = resolveLogoEffects(opts);
  if (!active.length) return null;
  const phrases = active.map((id) => EFFECT_BY_ID[id].promptPhrase);
  return `VISUAL EFFECTS: ${phrases.join(', ')}`;
}

export function randomLogoEffects(): LogoEffectId[] {
  const count = Math.floor(Math.random() * 4) + 1;
  const pool = [...LOGO_EFFECT_PRESETS];
  const picked: LogoEffectId[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]!.id);
  }
  return picked;
}

export function getLogoEffectPreset(id: LogoEffectId) {
  return EFFECT_BY_ID[id];
}

/** CSS-Hinweise für Live-Vorschau */
export function logoEffectsPreviewHints(effects: LogoEffectId[]) {
  return {
    hasGlow: effects.some((e) => ['fire', 'energy', 'magic', 'laser', 'lightning'].includes(e)),
    hasParticles: effects.some((e) => ['sparks', 'particles', 'snow', 'rain'].includes(e)),
    hasAtmosphere: effects.some((e) => ['smoke', 'fog', 'explosion'].includes(e)),
  };
}
