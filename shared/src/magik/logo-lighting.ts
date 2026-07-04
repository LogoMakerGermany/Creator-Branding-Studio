import type { LogoGenerationOptions, LogoLightingSettings } from '../studio';

export type LogoLightingKey = keyof LogoLightingSettings;

export const LOGO_LIGHTING_CONTROLS: {
  key: LogoLightingKey;
  label: string;
  hint: string;
  promptTerm: string;
}[] = [
  { key: 'glow', label: 'Glow', hint: 'Leuchten & Neon-Aura', promptTerm: 'glow intensity' },
  { key: 'light', label: 'Licht', hint: 'Hauptlicht & Key Light', promptTerm: 'key light strength' },
  { key: 'shadow', label: 'Schatten', hint: 'Tiefe & Kontrast', promptTerm: 'dramatic shadow depth' },
  { key: 'reflections', label: 'Reflexionen', hint: 'Spiegelungen & Glanz', promptTerm: 'reflective highlights' },
  { key: 'bloom', label: 'Bloom', hint: 'Weiches Licht-Bloom', promptTerm: 'cinematic bloom' },
  { key: 'hdr', label: 'HDR', hint: 'High Dynamic Range', promptTerm: 'HDR exposure' },
  { key: 'lensFlare', label: 'Lens Flare', hint: 'Filmische Lens Flares', promptTerm: 'lens flare accents' },
  { key: 'rimLight', label: 'Rim Light', hint: 'Kantenlicht & Silhouette', promptTerm: 'rim light edge glow' },
  { key: 'ambientLight', label: 'Ambient Light', hint: 'Umgebungslicht', promptTerm: 'ambient fill light' },
];

export const DEFAULT_LOGO_LIGHTING: LogoLightingSettings = {
  glow: 65,
  light: 70,
  shadow: 55,
  reflections: 60,
  bloom: 50,
  hdr: 55,
  lensFlare: 35,
  rimLight: 60,
  ambientLight: 45,
};

function intensityLabel(value: number): string {
  if (value <= 20) return 'subtle';
  if (value <= 45) return 'moderate';
  if (value <= 70) return 'strong';
  if (value <= 85) return 'intense';
  return 'maximum';
}

export function resolveLogoLighting(opts: LogoGenerationOptions): LogoLightingSettings {
  return { ...DEFAULT_LOGO_LIGHTING, ...opts.logoLighting };
}

/** Beleuchtungs-Phrase für MAGIK Prompts */
export function buildLogoLightingPromptPhrase(opts: LogoGenerationOptions): string {
  const lighting = resolveLogoLighting(opts);
  const parts = LOGO_LIGHTING_CONTROLS.map(({ key, promptTerm }) => {
    const value = lighting[key];
    if (value <= 5) return null;
    return `${intensityLabel(value)} ${promptTerm} (${value}%)`;
  }).filter(Boolean);

  if (!parts.length) return 'balanced cinematic studio lighting';
  return `LIGHTING SETUP: ${parts.join(', ')}`;
}

/** 0–1 für UI-Vorschau */
export function logoLightingPreviewFactors(opts: LogoGenerationOptions) {
  const l = resolveLogoLighting(opts);
  return {
    glow: l.glow / 100,
    bloom: l.bloom / 100,
    rim: l.rimLight / 100,
    shadow: l.shadow / 100,
  };
}

export function randomLogoLighting(): LogoLightingSettings {
  const rand = () => Math.floor(Math.random() * 81) + 20;
  return {
    glow: rand(),
    light: rand(),
    shadow: rand(),
    reflections: rand(),
    bloom: rand(),
    hdr: rand(),
    lensFlare: Math.floor(Math.random() * 60) + 10,
    rimLight: rand(),
    ambientLight: rand(),
  };
}
