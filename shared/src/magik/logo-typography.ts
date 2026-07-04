import type { LogoGenerationOptions, LogoTypographySettings } from '../studio';

export type LogoTypographyKey = Exclude<keyof LogoTypographySettings, 'fontFamily'>;

export const LOGO_FONT_PRESETS: {
  id: string;
  label: string;
  promptTerm: string;
  previewFont: string;
  previewStyle?: 'uppercase' | 'italic';
}[] = [
  { id: 'esports', label: 'Esports Bold', promptTerm: 'bold aggressive esports display typography', previewFont: "'Space Grotesk', Impact, 'Arial Black', sans-serif" },
  { id: 'display', label: 'Display', promptTerm: 'premium headline display lettering', previewFont: "'Space Grotesk', 'Arial Black', sans-serif" },
  { id: 'futuristic', label: 'Futuristisch', promptTerm: 'futuristic sci-fi tech lettering', previewFont: "'Space Grotesk', ui-monospace, monospace", previewStyle: 'uppercase' },
  { id: 'minimal', label: 'Minimal', promptTerm: 'clean minimal modern sans-serif wordmark', previewFont: "Inter, system-ui, sans-serif" },
  { id: 'military', label: 'Military', promptTerm: 'military stencil tactical lettering', previewFont: "'Courier New', ui-monospace, monospace", previewStyle: 'uppercase' },
  { id: 'horror', label: 'Horror', promptTerm: 'distressed horror scratch lettering', previewFont: "Impact, 'Arial Black', sans-serif", previewStyle: 'uppercase' },
  { id: 'script', label: 'Script', promptTerm: 'elegant script signature lettering accent', previewFont: "Georgia, 'Times New Roman', serif", previewStyle: 'italic' },
  { id: 'retro', label: 'Retro Arcade', promptTerm: 'retro arcade pixel-inspired lettering', previewFont: "'Courier New', monospace", previewStyle: 'uppercase' },
  { id: 'gothic', label: 'Gothic', promptTerm: 'gothic blackletter heavy metal lettering', previewFont: "Georgia, 'Times New Roman', serif", previewStyle: 'uppercase' },
  { id: 'neon', label: 'Neon Sign', promptTerm: 'neon sign tube lettering with glow read', previewFont: "'Space Grotesk', sans-serif", previewStyle: 'uppercase' },
];

export const LOGO_TYPOGRAPHY_CONTROLS: {
  key: LogoTypographyKey;
  label: string;
  hint: string;
}[] = [
  { key: 'size', label: 'Größe', hint: 'Schriftgröße & Dominanz' },
  { key: 'weight', label: 'Dicke', hint: 'Strichstärke & Boldness' },
  { key: 'outline', label: 'Kontur', hint: 'Stroke & Umrandung' },
  { key: 'glow', label: 'Glow', hint: 'Leuchten um die Schrift' },
  { key: 'letterSpacing', label: 'Abstand', hint: 'Letter-Spacing & Tracking' },
];

export const DEFAULT_LOGO_TYPOGRAPHY: LogoTypographySettings = {
  fontFamily: 'esports',
  size: 58,
  weight: 78,
  outline: 45,
  glow: 52,
  letterSpacing: 48,
};

function intensityLabel(value: number): string {
  if (value <= 20) return 'subtle';
  if (value <= 45) return 'moderate';
  if (value <= 70) return 'strong';
  if (value <= 85) return 'intense';
  return 'maximum';
}

function sizePhrase(value: number): string {
  if (value <= 25) return 'compact supporting text size';
  if (value <= 45) return 'balanced medium wordmark scale';
  if (value <= 70) return 'large dominant hero wordmark';
  if (value <= 85) return 'oversized bold title treatment';
  return 'massive billboard-scale lettering';
}

function weightPhrase(value: number): string {
  if (value <= 25) return 'light thin strokes';
  if (value <= 45) return 'regular medium weight';
  if (value <= 70) return 'bold heavy strokes';
  if (value <= 85) return 'extra-bold black weight';
  return 'ultra-heavy maximum stroke thickness';
}

function outlinePhrase(value: number): string {
  if (value <= 15) return 'no outline, clean fill only';
  if (value <= 40) return 'subtle stroke outline';
  if (value <= 70) return 'strong contrasting stroke border';
  if (value <= 85) return 'thick heavy outline frame';
  return 'extreme thick stroke with cut-out read';
}

function glowPhrase(value: number): string {
  if (value <= 15) return 'no text glow';
  if (value <= 40) return 'soft subtle text glow';
  if (value <= 70) return 'strong neon text glow aura';
  if (value <= 85) return 'intense luminous text bloom';
  return 'maximum radiant text glow halo';
}

function letterSpacingPhrase(value: number): string {
  if (value <= 25) return 'tight condensed letter spacing';
  if (value <= 45) return 'normal balanced tracking';
  if (value <= 70) return 'wide expanded letter spacing';
  if (value <= 85) return 'extra-wide cinematic tracking';
  return 'extreme spaced-out display tracking';
}

export function getLogoFontPreset(id: string) {
  return LOGO_FONT_PRESETS.find((p) => p.id === id) ?? LOGO_FONT_PRESETS[0]!;
}

export function resolveLogoTypography(opts: LogoGenerationOptions): LogoTypographySettings {
  return { ...DEFAULT_LOGO_TYPOGRAPHY, ...opts.logoTypography };
}

/** Typografie-Phrase für MAGIK Prompts */
export function buildLogoTypographyPromptPhrase(opts: LogoGenerationOptions): string {
  const t = resolveLogoTypography(opts);
  const font = getLogoFontPreset(t.fontFamily);
  const parts = [
    `typography style: ${font.promptTerm}`,
    `${intensityLabel(t.size)} size: ${sizePhrase(t.size)}`,
    `${intensityLabel(t.weight)} weight: ${weightPhrase(t.weight)}`,
    `${intensityLabel(t.outline)} outline: ${outlinePhrase(t.outline)}`,
    `${intensityLabel(t.glow)} text glow: ${glowPhrase(t.glow)}`,
    `${intensityLabel(t.letterSpacing)} tracking: ${letterSpacingPhrase(t.letterSpacing)}`,
  ];
  return `TYPOGRAPHY / WORDMARK: ${parts.join('; ')}`;
}

/** CSS-Stil für Live-Vorschau */
export function logoTypographyPreviewStyle(opts: LogoGenerationOptions, accentColor: string) {
  const t = resolveLogoTypography(opts);
  const font = getLogoFontPreset(t.fontFamily);
  const sizeRem = 0.85 + (t.size / 100) * 1.35;
  const weight = 400 + Math.round((t.weight / 100) * 500);
  const tracking = -0.02 + (t.letterSpacing / 100) * 0.35;
  const outlinePx = Math.round((t.outline / 100) * 4);
  const glowPx = Math.round((t.glow / 100) * 24);

  const textShadow = [
    t.outline > 10 && outlinePx > 0
      ? Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return `${Math.cos(a) * outlinePx}px ${Math.sin(a) * outlinePx}px 0 rgba(0,0,0,0.85)`;
        }).join(', ')
      : '',
    t.glow > 10 && glowPx > 0
      ? `0 0 ${glowPx}px ${accentColor}, 0 0 ${glowPx * 2}px ${accentColor}88`
      : '',
  ]
    .filter(Boolean)
    .join(', ');

  return {
    fontFamily: font.previewFont,
    fontSize: `${sizeRem}rem`,
    fontWeight: weight,
    letterSpacing: `${tracking}em`,
    fontStyle: font.previewStyle === 'italic' ? ('italic' as const) : ('normal' as const),
    textTransform: font.previewStyle === 'uppercase' ? ('uppercase' as const) : ('none' as const),
    textShadow: textShadow || undefined,
    WebkitTextStroke: t.outline > 50 && outlinePx > 0 ? `${Math.max(1, outlinePx - 1)}px rgba(0,0,0,0.6)` : undefined,
  };
}

export function randomLogoTypography(): LogoTypographySettings {
  const rand = () => Math.floor(Math.random() * 81) + 20;
  return {
    fontFamily: LOGO_FONT_PRESETS[Math.floor(Math.random() * LOGO_FONT_PRESETS.length)]!.id,
    size: rand(),
    weight: rand(),
    outline: rand(),
    glow: rand(),
    letterSpacing: rand(),
  };
}
