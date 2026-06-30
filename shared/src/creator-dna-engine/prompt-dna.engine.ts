import type { LogoGenerationOptions } from '../studio';
import type { CharacterDNA, CreatorPreferencesDNA, PromptDNABundle, StyleDNA } from './types';
import { characterDnaToPromptPhrase } from './character-dna.engine';
import { creatorPreferencesToPromptPhrase } from './creator-preferences.engine';
import { styleDnaToPromptPhrase } from './style-dna.engine';

export type PromptDnaContext = {
  name: string;
  styleDirection?: string;
  primaryColors: string[];
  secondaryColors: string[];
  accentColors: string[];
  platforms?: string[];
};

/** Prompt DNA Engine — kombiniert alle DNA-Schichten für MAGIK. */
export function buildPromptDNABundle(
  dna: PromptDnaContext,
  characterDna: CharacterDNA | null,
  preferences: CreatorPreferencesDNA | null,
  styleDna: StyleDNA,
  opts: LogoGenerationOptions
): PromptDNABundle {
  const characterBlock = characterDna
    ? characterDnaToPromptPhrase(characterDna)
    : 'CHARACTER DNA: emerging brand mascot from creator name';

  const creatorBlock = preferences
    ? creatorPreferencesToPromptPhrase(preferences)
    : `CREATOR DNA: ${dna.name}, direction ${dna.styleDirection ?? 'gaming'}, colors ${[...dna.primaryColors, ...dna.accentColors].slice(0, 4).join(', ')}`;

  const styleBlock = styleDnaToPromptPhrase(styleDna);

  const platformBlock = opts.platform?.trim()
    ? `PLATFORM DNA: optimized for ${opts.platform.trim()} branding, safe zones, readable at stream scale`
    : dna.platforms?.length
      ? `PLATFORM DNA: ${dna.platforms.join(', ')} optimized`
      : 'PLATFORM DNA: multi-platform esports branding';

  const gameBlock = opts.game?.trim()
    ? `GAME DNA: ${opts.game.trim()} universe aesthetic, franchise energy`
    : 'GAME DNA: general competitive gaming';

  const combinedPhrase = [characterBlock, creatorBlock, styleBlock, platformBlock, gameBlock]
    .filter(Boolean)
    .join('. ');

  return { characterBlock, creatorBlock, styleBlock, platformBlock, gameBlock, combinedPhrase };
}
