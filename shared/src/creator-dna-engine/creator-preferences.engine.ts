import type { LogoGenerationOptions } from '../studio';
import type { CreatorDNA } from '../creator-dna';
import type { CreatorPreferencesDNA, CharacterEffectId, CcdLearningSignal } from './types';
import { collectMagikColors } from '../magik';
import { STYLE_TO_EFFECTS } from './constants';

/** Creator DNA Engine — Präferenzen aus Generierung & Lernsignalen. */
export function buildCreatorPreferencesDNA(
  userId: string,
  creatorDna: CreatorDNA,
  opts: LogoGenerationOptions,
  existing?: CreatorPreferencesDNA | null,
  signals: CcdLearningSignal[] = []
): CreatorPreferencesDNA {
  const now = new Date().toISOString();
  const colors = collectMagikColors(opts);
  const style = opts.magikStyle ?? opts.style ?? 'Ultra-Cinematic';
  const bg = opts.magikBackground ?? 'dark';
  const effects = STYLE_TO_EFFECTS[style] ?? [];

  const positiveSignals = signals.filter((s) => s.eventType === 'download' || s.eventType === 'favorite');
  const negativeSignals = signals.filter((s) => s.eventType === 'delete');

  function bump<T>(list: T[], value: T, weight = 1): T[] {
    const next = [...list];
    for (let i = 0; i < weight; i++) next.push(value);
    return [...new Set(next)].slice(-12);
  }

  function demote<T>(list: T[], value: T): T[] {
    return list.filter((v) => v !== value);
  }

  let favoriteColors = existing?.favoriteColors ?? [...creatorDna.primaryColors, ...creatorDna.accentColors];
  let preferredLogoStyles = existing?.preferredLogoStyles ?? [style];
  let preferredGames = existing?.preferredGames ?? (opts.game ? [opts.game] : []);
  let preferredPlatforms = existing?.preferredPlatforms ?? (opts.platform ? [opts.platform] : []);
  let preferredBackgrounds = existing?.preferredBackgrounds ?? [bg];
  let preferredEffects = existing?.preferredEffects ?? effects;

  for (const s of positiveSignals) {
    if (s.style) preferredLogoStyles = bump(preferredLogoStyles, s.style);
    if (s.game) preferredGames = bump(preferredGames, s.game);
    if (s.background) preferredBackgrounds = bump(preferredBackgrounds, s.background);
    if (s.effects?.length) {
      for (const eff of s.effects) {
        preferredEffects = bump(preferredEffects, eff as CharacterEffectId);
      }
    }
  }
  for (const s of negativeSignals) {
    if (s.style) preferredLogoStyles = demote(preferredLogoStyles, s.style);
    if (s.game) preferredGames = demote(preferredGames, s.game);
  }

  colors.forEach((c) => {
    favoriteColors = bump(favoriteColors, c);
  });

  return {
    userId,
    creatorDnaId: creatorDna.id,
    favoriteColors: favoriteColors.slice(0, 12),
    preferredLogoStyles: preferredLogoStyles.slice(0, 8),
    preferredGames: preferredGames.slice(0, 8),
    preferredPlatforms: preferredPlatforms.slice(0, 8),
    preferredFonts: existing?.preferredFonts ?? creatorDna.fonts.map((f) => f.name),
    preferredBackgrounds: preferredBackgrounds.slice(0, 8),
    preferredEffects: preferredEffects.slice(0, 10),
    ringLogoPreference: opts.ringLogoMode ?? existing?.ringLogoPreference ?? 'auto',
    dimensionPreference:
      opts.magikLogoArt === '2d' ? '2d' : existing?.dimensionPreference ?? '3d',
    exportFormats: existing?.exportFormats ?? ['png', 'svg'],
    updatedAt: now,
  };
}

export function creatorPreferencesToPromptPhrase(prefs: CreatorPreferencesDNA): string {
  return [
    `CREATOR PREFERENCES: favorite colors ${prefs.favoriteColors.slice(0, 4).join(', ')}`,
    `preferred styles ${prefs.preferredLogoStyles.slice(0, 3).join(', ')}`,
    prefs.preferredGames.length ? `games ${prefs.preferredGames.slice(0, 2).join(', ')}` : null,
    prefs.preferredPlatforms.length ? `platforms ${prefs.preferredPlatforms.join(', ')}` : null,
    `effects ${prefs.preferredEffects.slice(0, 4).join(', ')}`,
    `${prefs.dimensionPreference} dimension, ring logo ${prefs.ringLogoPreference}`,
  ]
    .filter(Boolean)
    .join('. ');
}
