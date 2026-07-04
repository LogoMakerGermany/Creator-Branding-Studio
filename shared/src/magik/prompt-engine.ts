import type { LogoGenerationOptions } from '../studio';
import type { CharacterDNA, CreatorPreferencesDNA } from '../creator-dna-engine';
import { buildPromptDNABundle, buildStyleDNA } from '../creator-dna-engine';

/** Kontext für MAGIK inkl. optionaler CCD-Daten. */
export type MagikPromptContext = LogoDnaContext & {
  characterDna?: CharacterDNA | null;
  creatorPreferences?: CreatorPreferencesDNA | null;
};
import { collectLogoColors } from '../logo-prompt';
import {
  MAGIK_QUALITY_DNA,
  DEFAULT_MAGIK_STYLE,
  normalizeMagikStyle,
  type MagikBackgroundId,
  type MagikLogoArtId,
  type MagikRingMode,
} from './constants';
import { analyzeMagikName, resolveMagikCharacter } from './name-parser';

/** Minimal DNA context for MAGIK prompt building. */
export type LogoDnaContext = {
  name: string;
  styleDirection?: string;
  primaryColors: string[];
  secondaryColors: string[];
  accentColors: string[];
};

export type MagikLogoMode = 'name' | 'character';
export type MagikPromptVariant = 'a' | 'b';

export type MagikValidationErrors = Partial<
  Record<'logoName' | 'character' | 'customCharacter' | 'colors', string>
>;

export function validateMagikLogoOptions(opts: LogoGenerationOptions): MagikValidationErrors {
  const errors: MagikValidationErrors = {};
  if (!opts.logoName?.trim() || opts.logoName.trim().length < 2) {
    errors.logoName = 'Logo-Name erforderlich (mind. 2 Zeichen)';
  }
  const mode = opts.magikMode ?? 'name';
  if (mode === 'character') {
    const char = resolveMagikCharacter(opts.magikCharacter, opts.customCharacter);
    if (!char) errors.character = 'Figur auswählen oder eigene Figur eingeben';
  }
  const colors = collectMagikColors(opts);
  if (colors.length === 0) errors.colors = 'Mindestens eine Farbe wählen';
  return errors;
}

export function isMagikFormValid(opts: LogoGenerationOptions): boolean {
  return Object.keys(validateMagikLogoOptions(opts)).length === 0;
}

export function collectMagikColors(opts: LogoGenerationOptions): string[] {
  if (opts.selectedColors?.length) return opts.selectedColors.filter(Boolean).slice(0, 6);
  return collectLogoColors(opts);
}

function resolveRingMode(opts: LogoGenerationOptions, nameAnalysis?: ReturnType<typeof analyzeMagikName>): string {
  const mode: MagikRingMode = opts.ringLogoMode ?? (opts.ringLogo ? 'yes' : 'auto');
  if (mode === 'yes') return 'circular ring logo emblem, icon centered inside premium metallic ring';
  if (mode === 'no') return 'standalone iconic mark, no ring, bold silhouette';
  const suggest = nameAnalysis?.suggestRing ?? opts.logoName!.trim().length <= 12;
  return suggest
    ? 'intelligent auto ring logo: circular esports emblem with centered motif'
    : 'intelligent auto layout: wide wordmark-friendly logo without ring';
}

function logoArtPhrase(art: MagikLogoArtId = 'ultra-cinematic-3d'): string {
  switch (art) {
    case '2d':
      return 'flat 2D vector esports logo, crisp shapes';
    case '3d':
      return '3D rendered logo with depth and beveled forms';
    case 'ultra-3d':
      return 'ultra 3D extruded logo, heavy depth, metallic materials';
    case 'ultra-cinematic-3d':
    default:
      return 'ultra cinematic 3D logo render, AAA game cinematic quality';
  }
}

function backgroundPhrase(bg: MagikBackgroundId = 'transparent', opts: LogoGenerationOptions): string {
  if (bg === 'transparent' || opts.transparentBackground) {
    return 'transparent background, isolated logo, alpha channel ready, no backdrop fill';
  }
  const map: Record<MagikBackgroundId, string> = {
    transparent: 'transparent background',
    dark: 'dark cinematic void background with subtle vignette',
    fire: 'fiery inferno background with embers and heat distortion',
    ice: 'frozen ice crystal background with cold mist',
    lightning: 'electric lightning storm background with energy arcs',
    fog: 'mysterious fog and smoke atmosphere',
    space: 'deep space nebula cosmic background',
    ruins: 'ancient ruins apocalyptic background',
    abstract: 'abstract geometric energy background',
    arena: 'esports arena stadium lights background',
  };
  return map[bg] ?? map.dark;
}

function stylePhrase(opts: LogoGenerationOptions): string {
  return normalizeMagikStyle(opts.magikStyle ?? opts.style);
}

function resolveMotif(opts: LogoGenerationOptions): { motif: string; nameInsight?: string } {
  const mode = opts.magikMode ?? 'name';
  if (mode === 'character') {
    const char = resolveMagikCharacter(opts.magikCharacter, opts.customCharacter);
    return { motif: `central character mascot: ${char}` };
  }
  const analysis = analyzeMagikName(opts.logoName!.trim());
  return {
    motif: `name-inspired mascot fusion: ${analysis.motifs.join(', ')}`,
    nameInsight: analysis.summary,
  };
}

function qualityBlock(opts: LogoGenerationOptions): string {
  const extra =
    opts.transparentBackground || opts.magikBackground === 'transparent' ? ['transparent background'] : [];
  return [...MAGIK_QUALITY_DNA, ...extra].join(', ');
}

function buildCorePrompt(
  dna: LogoDnaContext,
  opts: LogoGenerationOptions,
  variant: MagikPromptVariant,
  ccd?: { characterDna?: CharacterDNA | null; creatorPreferences?: CreatorPreferencesDNA | null }
): string {
  const name = opts.logoName!.trim();
  const { motif, nameInsight } = resolveMotif(opts);
  const analysis = opts.magikMode !== 'character' ? analyzeMagikName(name) : undefined;
  const colors = collectMagikColors(opts).join(', ');
  const game = opts.game?.trim() ? `game universe: ${opts.game.trim()}` : 'general esports gaming';
  const platform = opts.platform?.trim() ? `platform: ${opts.platform}` : null;

  const variantFocus =
    variant === 'a'
      ? `VARIANT A name-focused: emphasize readable wordmark "${name}", strong name identity, mascot supports the title`
      : `VARIANT B design-focused: maximize visual impact, extra particles, smoke, energy, creative AAA detail, mascot as hero`;

  const styleDna = buildStyleDNA(opts, ccd?.characterDna);
  const promptDna = buildPromptDNABundle(
    {
      name: dna.name,
      styleDirection: dna.styleDirection,
      primaryColors: dna.primaryColors,
      secondaryColors: dna.secondaryColors,
      accentColors: dna.accentColors,
    },
    ccd?.characterDna ?? null,
    ccd?.creatorPreferences ?? null,
    styleDna,
    opts
  );

  const parts = [
    `ULTIMATE CREATOR BRANDING STUDIO premium esports logo for "${name}"`,
    opts.clanName?.trim() ? `team: ${opts.clanName.trim()}` : null,
    opts.logoSubtitle?.trim() ? `creator context: ${opts.logoSubtitle.trim()} branding identity` : null,
    opts.slogan?.trim() ? `tagline energy: ${opts.slogan.trim()}` : null,
    nameInsight,
    motif,
    game,
    platform,
    `visual style: ${stylePhrase(opts)}`,
    logoArtPhrase(opts.magikLogoArt ?? 'ultra-cinematic-3d'),
    resolveRingMode(opts, analysis),
    `color harmony palette: ${colors}`,
    backgroundPhrase((opts.magikBackground as MagikBackgroundId) ?? 'dark', opts),
    variantFocus,
    promptDna.combinedPhrase,
    `brand DNA direction: ${dna.styleDirection ?? 'gaming'}`,
    `MAGIK QUALITY DNA: ${qualityBlock(opts)}`,
  ];

  return parts.filter(Boolean).join('. ') + '.';
}

export interface MagikPromptPair {
  variantA: string;
  variantB: string;
  nameAnalysis?: ReturnType<typeof analyzeMagikName>;
}

/** Erzeugt optimierte Prompt-Paare (Variante A + B). */
export function buildMagikLogoPrompts(
  dna: LogoDnaContext,
  opts: LogoGenerationOptions,
  ccd?: { characterDna?: CharacterDNA | null; creatorPreferences?: CreatorPreferencesDNA | null }
): MagikPromptPair {
  const errors = validateMagikLogoOptions(opts);
  if (Object.keys(errors).length > 0) throw new Error('MAGIK Eingaben unvollständig');

  const base = { ...opts };
  const nameAnalysis = base.magikMode !== 'character' ? analyzeMagikName(base.logoName!.trim()) : undefined;

  const variantA = base.customPromptOverride?.trim() || buildCorePrompt(dna, base, 'a', ccd);
  const variantB = base.customPromptOverride?.trim()
    ? `${base.customPromptOverride.trim()}. VARIANT B design-focused: maximize visual impact, extra particles, smoke, energy, creative AAA detail.`
    : buildCorePrompt(dna, base, 'b', ccd);

  return { variantA, variantB, nameAnalysis };
}

export function buildMagikLogoPrompt(
  dna: LogoDnaContext,
  opts: LogoGenerationOptions,
  variant: MagikPromptVariant = 'a'
): string {
  const pair = buildMagikLogoPrompts(dna, opts);
  return variant === 'b' ? pair.variantB : pair.variantA;
}

/** @deprecated Use buildMagikLogoPrompt — kept for backend compat */
export function buildLogoPrompt(dna: LogoDnaContext, opts: LogoGenerationOptions): string {
  const magikOpts: LogoGenerationOptions = {
    ...opts,
    magikMode: opts.magikMode ?? 'name',
    magikStyle: opts.magikStyle ?? opts.style ?? DEFAULT_MAGIK_STYLE,
    magikLogoArt: opts.magikLogoArt ?? 'ultra-cinematic-3d',
    magikBackground: opts.magikBackground ?? (opts.transparentBackground ? 'transparent' : 'dark'),
    ringLogoMode: opts.ringLogoMode ?? (opts.ringLogo ? 'yes' : 'auto'),
  };
  return buildMagikLogoPrompt(dna, magikOpts, opts.magikVariant ?? 'a');
}
