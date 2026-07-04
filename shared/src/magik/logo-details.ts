import type { LogoGenerationOptions, LogoDetailsSettings } from '../studio';

export type LogoDetailsKey = keyof LogoDetailsSettings;

export const LOGO_DETAILS_CONTROLS: {
  key: LogoDetailsKey;
  label: string;
  hint: string;
}[] = [
  { key: 'detail', label: 'Detailgrad', hint: 'Feindetails & Mikro-Elemente' },
  { key: 'realism', label: 'Realismus', hint: 'Fotorealistisch vs. stilisiert' },
  { key: 'sharpness', label: 'Schärfe', hint: 'Kanten & Klarheit' },
  { key: 'contrast', label: 'Kontrast', hint: 'Licht-Dunkel-Spannung' },
  { key: 'saturation', label: 'Sättigung', hint: 'Farbintensität & Punch' },
  { key: 'texture', label: 'Textur', hint: 'Oberflächen-Grain & Mikrostruktur' },
];

export const DEFAULT_LOGO_DETAILS: LogoDetailsSettings = {
  detail: 70,
  realism: 65,
  sharpness: 72,
  contrast: 68,
  saturation: 60,
  texture: 55,
};

function intensityLabel(value: number): string {
  if (value <= 20) return 'minimal';
  if (value <= 45) return 'moderate';
  if (value <= 70) return 'high';
  if (value <= 85) return 'ultra';
  return 'maximum';
}

function detailPhrase(value: number): string {
  if (value <= 25) return 'clean simplified shapes, minimal micro-detail';
  if (value <= 45) return 'balanced detail with readable silhouette';
  if (value <= 70) return 'rich AAA micro-detail and intricate accents';
  if (value <= 85) return 'hyper-detailed ornamentation and fine engravings';
  return 'extreme micro-detail density, every surface tells a story';
}

function realismPhrase(value: number): string {
  if (value <= 25) return 'stylized graphic logo, flat illustrative read';
  if (value <= 45) return 'semi-realistic esports illustration';
  if (value <= 70) return 'cinematic semi-photoreal render quality';
  if (value <= 85) return 'near-photoreal materials and lighting response';
  return 'ultra-photoreal AAA game cinematic realism';
}

function sharpnessPhrase(value: number): string {
  if (value <= 25) return 'soft edges, gentle anti-aliased look';
  if (value <= 45) return 'clean readable edges';
  if (value <= 70) return 'crisp razor-sharp contour definition';
  if (value <= 85) return 'ultra-crisp edge clarity, pin-sharp highlights';
  return 'maximum sharpness, laser-cut precision edges';
}

function contrastPhrase(value: number): string {
  if (value <= 25) return 'low contrast, soft tonal range';
  if (value <= 45) return 'balanced mid contrast';
  if (value <= 70) return 'strong punchy contrast for thumbnail impact';
  if (value <= 85) return 'high dynamic contrast, deep blacks and bright highlights';
  return 'extreme contrast, dramatic light-dark separation';
}

function saturationPhrase(value: number): string {
  if (value <= 25) return 'desaturated muted palette';
  if (value <= 45) return 'slightly muted professional tones';
  if (value <= 70) return 'vivid saturated esports colors';
  if (value <= 85) return 'hyper-saturated neon punch';
  return 'maximum color saturation and vibrancy';
}

function texturePhrase(value: number): string {
  if (value <= 25) return 'smooth clean surfaces';
  if (value <= 45) return 'subtle surface variation';
  if (value <= 70) return 'visible material grain and tactile texture';
  if (value <= 85) return 'rich micro-texture and surface complexity';
  return 'extreme tactile texture, every material feels physical';
}

export function resolveLogoDetails(opts: LogoGenerationOptions): LogoDetailsSettings {
  return { ...DEFAULT_LOGO_DETAILS, ...opts.logoDetails };
}

/** Detail-Phrase für MAGIK Prompts */
export function buildLogoDetailsPromptPhrase(opts: LogoGenerationOptions): string {
  const d = resolveLogoDetails(opts);
  const parts = [
    `${intensityLabel(d.detail)} detail: ${detailPhrase(d.detail)}`,
    `${intensityLabel(d.realism)} realism: ${realismPhrase(d.realism)}`,
    `${intensityLabel(d.sharpness)} sharpness: ${sharpnessPhrase(d.sharpness)}`,
    `${intensityLabel(d.contrast)} contrast: ${contrastPhrase(d.contrast)}`,
    `${intensityLabel(d.saturation)} saturation: ${saturationPhrase(d.saturation)}`,
    `${intensityLabel(d.texture)} texture: ${texturePhrase(d.texture)}`,
  ];
  return `LOGO DETAIL QUALITY: ${parts.join('; ')}`;
}

/** 0–1 Faktoren für UI-Vorschau */
export function logoDetailsPreviewFactors(opts: LogoGenerationOptions) {
  const d = resolveLogoDetails(opts);
  return {
    detail: d.detail / 100,
    realism: d.realism / 100,
    sharpness: d.sharpness / 100,
    contrast: d.contrast / 100,
    saturation: d.saturation / 100,
    texture: d.texture / 100,
  };
}

export function randomLogoDetails(): LogoDetailsSettings {
  const rand = () => Math.floor(Math.random() * 81) + 20;
  return {
    detail: rand(),
    realism: rand(),
    sharpness: rand(),
    contrast: rand(),
    saturation: rand(),
    texture: rand(),
  };
}
