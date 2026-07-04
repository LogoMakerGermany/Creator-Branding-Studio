import type { LogoGenerationOptions } from '../studio';
import type { CreatorDNA } from '../creator-dna';
import { analyzeMagikName, resolveMagikCharacter, collectMagikColors, normalizeMagikStyle } from '../magik';
import type {
  CharacterDNA,
  CharacterColorDna,
  CharacterPersonalityId,
  CharacterVisualDna,
  CharacterEffectId,
  CharacterPoseId,
  CharacterEnvironmentId,
} from './types';
import {
  BACKGROUND_TO_ENVIRONMENT,
  STYLE_TO_EFFECTS,
  STYLE_TO_PERSONALITY,
  STYLE_TO_POSE,
} from './constants';

export type BuildCharacterDnaInput = {
  userId: string;
  creatorDna: CreatorDNA;
  opts: LogoGenerationOptions;
  existing?: CharacterDNA | null;
  jobId?: string;
  imageUrl?: string;
};

function resolveFigure(opts: LogoGenerationOptions): { figure: string; subFigure?: string; summary?: string } {
  if (opts.magikMode === 'character') {
    const char = resolveMagikCharacter(opts.magikCharacter, opts.customCharacter);
    return { figure: char || 'custom mascot', subFigure: opts.customCharacter };
  }
  const analysis = analyzeMagikName(opts.logoName?.trim() ?? '');
  const primary = analysis.motifs[0] ?? 'esports mascot';
  const sub = analysis.motifs[1];
  return { figure: primary, subFigure: sub, summary: analysis.summary };
}

function inferVisualDna(
  figure: string,
  style: string,
  personality: CharacterPersonalityId
): CharacterVisualDna {
  const lower = figure.toLowerCase();
  const visual: CharacterVisualDna = {
    expression: personality === 'aggressive' ? 'fierce snarl' : personality === 'heroic' ? 'confident heroic' : 'intense focused',
    gazeDirection: 'forward commanding',
    eyes: 'glowing cinematic eyes',
  };

  if (/wolf|lion|tiger|bear|drache|dragon/.test(lower)) {
    visual.fur = /dragon|drache/.test(lower) ? undefined : 'textured premium fur';
    visual.scales = /dragon|drache/.test(lower) ? 'armored dragon scales' : undefined;
    visual.teeth = 'sharp predator teeth';
  }
  if (/alien|zecke|parasite/.test(lower)) {
    visual.skin = 'otherworldly alien skin';
    visual.eyes = 'glowing extraterrestrial eyes';
  }
  if (/samurai|ninja|knight|ritter|vikinger|wikinger/.test(lower)) {
    visual.armor = 'premium battle armor';
    visual.helmet = /samurai|knight|ritter|vikinger/.test(lower) ? 'ornate war helmet' : undefined;
    visual.clothing = 'warrior battle garb';
  }
  if (/demon|dämon|reaper|venom|shadow|ghost/.test(lower)) {
    visual.horns = /demon|dämon/.test(lower) ? 'dark curved horns' : undefined;
    visual.hood = /reaper|shadow|ghost/.test(lower) ? 'mysterious hood' : undefined;
    visual.scars = 'battle scars';
  }
  if (/angel|engel|phoenix|phönix/.test(lower)) {
    visual.wings = /angel|engel|phoenix|phönix/.test(lower) ? 'majestic wings' : undefined;
    visual.hair = 'flowing heroic hair';
  }
  if (/robot|mecha|cyber|space marine/.test(lower)) {
    visual.armor = 'futuristic mech plating';
    visual.mask = 'high-tech visor mask';
    visual.skin = 'synthetic cyber skin panels';
  }
  if (/magier|hexe|mage|witch/.test(lower)) {
    visual.clothing = 'arcane robes';
    visual.jewelry = 'mystic rune jewelry';
  }
  if (['Gaming', 'Crystal', 'Neon', 'Fire', 'Ice', 'Toxic'].includes(style)) {
    visual.armor = visual.armor ?? 'element-infused armor';
  }

  return visual;
}

function buildColorDna(opts: LogoGenerationOptions, creatorDna: CreatorDNA): CharacterColorDna {
  const selected = collectMagikColors(opts);
  const primary = selected.slice(0, 2).length ? selected.slice(0, 2) : creatorDna.primaryColors;
  const secondary = selected.slice(2, 4).length ? selected.slice(2, 4) : creatorDna.secondaryColors;
  const accent = selected.slice(4, 6).length ? selected.slice(4, 6) : creatorDna.accentColors;

  return {
    primary,
    secondary,
    accent,
    glow: opts.glowColor ? [opts.glowColor] : accent.length ? accent : ['#22d3ee'],
    metal: ['#c0c0c0', '#2d2d2d'],
    lighting: ['volumetric rim light', 'cinematic key light'],
  };
}

function mergeVisual(existing: CharacterVisualDna, next: CharacterVisualDna): CharacterVisualDna {
  return { ...existing, ...Object.fromEntries(Object.entries(next).filter(([, v]) => v)) };
}

/** Character DNA Engine — analysiert Name/Figur und erzeugt persistente Identität. */
export function buildCharacterDNA(input: BuildCharacterDnaInput): CharacterDNA {
  const { userId, creatorDna, opts, existing, jobId, imageUrl } = input;
  const now = new Date().toISOString();
  const style = normalizeMagikStyle(opts.magikStyle ?? opts.style);
  const { figure, subFigure, summary } = resolveFigure(opts);
  const personality = STYLE_TO_PERSONALITY[style] ?? 'heroic';
  const effects = STYLE_TO_EFFECTS[style] ?? ['particles', 'energy', 'smoke'];
  const pose = STYLE_TO_POSE[style] ?? 'heroic';
  const bgKey = opts.magikBackground ?? (opts.transparentBackground ? 'transparent' : 'dark');
  const environment = BACKGROUND_TO_ENVIRONMENT[bgKey] ?? 'abstract';

  const visual = existing
    ? mergeVisual(existing.visual, inferVisualDna(figure, style, personality))
    : inferVisualDna(figure, style, personality);

  const colors = existing
    ? {
        ...existing.colors,
        primary: buildColorDna(opts, creatorDna).primary,
        accent: buildColorDna(opts, creatorDna).accent,
      }
    : buildColorDna(opts, creatorDna);

  const mergedEffects = [...new Set([...(existing?.effects ?? []), ...effects])].slice(0, 8) as CharacterEffectId[];

  return {
    id: existing?.id ?? `ccd-${userId}`,
    userId,
    creatorDnaId: creatorDna.id,
    creatorName: opts.logoName?.trim() ?? creatorDna.name,
    clanName: opts.clanName?.trim() || existing?.clanName,
    figure: existing ? existing.figure : figure,
    subFigure: subFigure ?? existing?.subFigure,
    personality: existing?.personality ?? personality,
    style: existing ? `${existing.style}, ${style}` : style,
    game: opts.game?.trim() || existing?.game,
    platform: opts.platform?.trim() || existing?.platform,
    visual,
    colors,
    effects: mergedEffects,
    pose: existing?.pose ?? pose,
    environment: existing?.environment ?? environment,
    nameAnalysisSummary: summary ?? existing?.nameAnalysisSummary,
    sourceLogoJobId: jobId ?? existing?.sourceLogoJobId,
    sourceImageUrl: imageUrl ?? existing?.sourceImageUrl,
    generationCount: (existing?.generationCount ?? 0) + 1,
    version: (existing?.version ?? 0) + 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function characterDnaToPromptPhrase(dna: CharacterDNA): string {
  const visualTraits = Object.entries(dna.visual)
    .filter(([, v]) => v)
    .map(([, v]) => v)
    .join(', ');

  return [
    `CHARACTER DNA: ${dna.figure}`,
    dna.subFigure ? `sub-motif: ${dna.subFigure}` : null,
    `personality: ${dna.personality}`,
    visualTraits ? `visual identity: ${visualTraits}` : null,
    `pose: ${dna.pose}`,
    `environment: ${dna.environment}`,
    `signature effects: ${dna.effects.join(', ')}`,
    `color DNA: primary ${dna.colors.primary.join(', ')}, accent ${dna.colors.accent.join(', ')}, glow ${dna.colors.glow.join(', ')}`,
  ]
    .filter(Boolean)
    .join('. ');
}
