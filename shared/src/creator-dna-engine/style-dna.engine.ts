import type { LogoGenerationOptions } from '../studio';
import type { CharacterDNA, StyleDNA } from './types';

/** Style DNA Engine — konsistenter visueller Stil über alle Generatoren. */
export function buildStyleDNA(opts: LogoGenerationOptions, character?: CharacterDNA | null): StyleDNA {
  const magikStyle = opts.magikStyle ?? opts.style ?? 'Ultra-Cinematic';
  const logoArt = opts.magikLogoArt ?? 'ultra-cinematic-3d';

  const moodMap: Record<string, string[]> = {
    Fire: ['inferno', 'aggressive', 'blazing'],
    Ice: ['frozen', 'sharp', 'crystalline'],
    Dark: ['ominous', 'powerful', 'shadow'],
    Cyberpunk: ['neon', 'futuristic', 'edgy'],
    'Ultra-Cinematic': ['epic', 'cinematic', 'AAA'],
    Esports: ['competitive', 'bold', 'premium'],
    Fantasy: ['mythic', 'legendary', 'magical'],
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
