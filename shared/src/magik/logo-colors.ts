import type { LogoGenerationOptions } from '../studio';

export const DEFAULT_LOGO_COLORS = {
  primary: '#22d3ee',
  secondary: '#a855f7',
  accent: '#34d399',
  glow: '#22d3ee',
  background: '#0b0f14',
  gradientFrom: '#22d3ee',
  gradientTo: '#a855f7',
} as const;

export type LogoColorField =
  | 'primaryColor'
  | 'secondaryColor'
  | 'accentColor'
  | 'glowColor'
  | 'backgroundColor';

export const LOGO_COLOR_FIELDS: { key: LogoColorField; label: string; hint: string }[] = [
  { key: 'primaryColor', label: 'Primärfarbe', hint: 'Hauptfarbe des Logos' },
  { key: 'secondaryColor', label: 'Sekundärfarbe', hint: 'Ergänzende Farbe' },
  { key: 'accentColor', label: 'Akzentfarbe', hint: 'Highlights & Details' },
  { key: 'glowColor', label: 'Glowfarbe', hint: 'Leuchten & Neon-Effekte' },
  { key: 'backgroundColor', label: 'Hintergrundfarbe', hint: 'Hintergrund-Ton (bei solid)' },
];

/** Synchronisiert selectedColors aus Einzelfeldern */
export function syncLogoSelectedColors(form: LogoGenerationOptions): string[] {
  const base = [
    form.primaryColor,
    form.secondaryColor,
    form.accentColor,
    form.glowColor,
    form.backgroundColor,
  ].filter(Boolean) as string[];

  if (form.logoGradientEnabled && form.logoGradientFrom && form.logoGradientTo) {
    base.push(form.logoGradientFrom, form.logoGradientTo);
  }

  return [...new Set(base)].slice(0, 8);
}

/** CSS linear-gradient für UI-Vorschau */
export function buildLogoGradientCss(form: LogoGenerationOptions): string | null {
  if (!form.logoGradientEnabled) return null;
  const from = form.logoGradientFrom ?? form.primaryColor ?? DEFAULT_LOGO_COLORS.gradientFrom;
  const to = form.logoGradientTo ?? form.secondaryColor ?? DEFAULT_LOGO_COLORS.gradientTo;
  const angle = form.logoGradientAngle ?? 135;
  return `linear-gradient(${angle}deg, ${from}, ${to})`;
}

/** Detaillierte Farb-Phrase für MAGIK Prompts */
export function buildLogoColorPromptPhrase(opts: LogoGenerationOptions): string {
  const primary = opts.primaryColor ?? DEFAULT_LOGO_COLORS.primary;
  const secondary = opts.secondaryColor ?? DEFAULT_LOGO_COLORS.secondary;
  const accent = opts.accentColor ?? DEFAULT_LOGO_COLORS.accent;
  const glow = opts.glowColor ?? accent;
  const background = opts.backgroundColor ?? DEFAULT_LOGO_COLORS.background;

  const parts = [
    `primary ${primary}`,
    `secondary ${secondary}`,
    `accent ${accent}`,
    `glow ${glow}`,
    `background tone ${background}`,
  ];

  if (opts.logoGradientEnabled) {
    const from = opts.logoGradientFrom ?? primary;
    const to = opts.logoGradientTo ?? secondary;
    parts.push(`smooth color gradient from ${from} to ${to}`);
  }

  return parts.join(', ');
}

/** Wendet eine 3-Farben-Palette auf alle Felder an */
export function applyLogoPaletteToForm(
  form: LogoGenerationOptions,
  colors: string[]
): Partial<LogoGenerationOptions> {
  const [primary, secondary, accent] = colors;
  return {
    primaryColor: primary ?? form.primaryColor,
    secondaryColor: secondary ?? form.secondaryColor,
    accentColor: accent ?? form.accentColor,
    glowColor: accent ?? primary ?? form.glowColor,
    backgroundColor: secondary ?? DEFAULT_LOGO_COLORS.background,
    logoGradientFrom: primary ?? form.logoGradientFrom,
    logoGradientTo: secondary ?? form.logoGradientTo,
    selectedColors: colors,
  };
}
