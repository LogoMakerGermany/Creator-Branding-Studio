import type { LogoGenerationOptions } from '../studio';
import type { CharacterDNA, StyleDNA } from './types';
import { normalizeMagikStyle } from '../magik/logo-style-presets';

/** Style DNA Engine — konsistenter visueller Stil über alle Generatoren. */
export function buildStyleDNA(opts: LogoGenerationOptions, character?: CharacterDNA | null): StyleDNA {
  const magikStyle = normalizeMagikStyle(opts.magikStyle ?? opts.style);
  const logoArt = opts.magikLogoArt ?? 'ultra-cinematic-3d';

  const moodMap: Record<string, string[]> = {
    Gaming: ['dynamic', 'aggressive', 'competitive'],
    Crystal: ['frozen', 'sharp', 'crystalline'],
    Dark: ['ominous', 'powerful', 'shadow'],
    Cyberpunk: ['neon', 'futuristic', 'edgy'],
    Cinematic: ['epic', 'cinematic', 'AAA'],
    Esports: ['competitive', 'bold', 'premium'],
    Fantasy: ['mythic', 'legendary', 'magical'],
    Horror: ['dark', 'ominous', 'intense'],
    Neon: ['electric', 'vibrant', 'glow'],
    'Sci-Fi': ['futuristic', 'cosmic', 'tech'],
    Metallic: ['industrial', 'chrome', 'heavy'],
    Premium: ['luxury', 'polished', 'elite'],
    Diamond: ['brilliant', 'precious', 'sharp'],
    Military: ['tactical', 'precise', 'bold'],
    Viking: ['nordic', 'fierce', 'ancient'],
  };

  return {
    magikStyle,
    logoArt,
    qualityTier: 'ultra-cinematic',
    moodKeywords: moodMap[magikStyle] ?? ['premium', 'gaming', 'esports'],
    visualKeywords: [
      logoArt,
      character?.personality ?? 'heroic',
      ...(character?.effects.slice(0, 3) ?? []),
    ],
  };
}

export function styleDnaToPromptPhrase(style: StyleDNA): string {
  return `STYLE DNA: ${style.magikStyle}, ${style.logoArt}, mood ${style.moodKeywords.join(', ')}, visual ${style.visualKeywords.join(', ')}, ${style.qualityTier} quality`;
}
