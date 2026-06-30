import type { CharacterDNA, CreatorPreferencesDNA, CcdRecommendation } from './types';

/** Recommendation Engine — Vorschläge aus Character & Creator Präferenzen. */
export function buildCcdRecommendations(
  character: CharacterDNA | null,
  preferences: CreatorPreferencesDNA | null
): CcdRecommendation[] {
  const items: CcdRecommendation[] = [];

  if (preferences?.preferredLogoStyles[0]) {
    items.push({
      id: 'rec-style',
      type: 'style',
      title: `Bevorzugter Stil: ${preferences.preferredLogoStyles[0]}`,
      description: 'Basierend auf deinen erfolgreichen Generierungen',
      confidence: 0.85,
    });
  }

  if (preferences?.favoriteColors.length) {
    items.push({
      id: 'rec-colors',
      type: 'color',
      title: 'Lieblingsfarben beibehalten',
      description: preferences.favoriteColors.slice(0, 3).join(', '),
      confidence: 0.9,
    });
  }

  if (character && character.effects.length < 5) {
    items.push({
      id: 'rec-effects',
      type: 'effect',
      title: 'Mehr Signatur-Effekte',
      description: `Ergänze ${character.personality}-typische Partikel und Energie`,
      confidence: 0.7,
    });
  }

  if (character?.pose === 'calm') {
    items.push({
      id: 'rec-pose',
      type: 'pose',
      title: 'Heroische Pose',
      description: 'Wechsle zu einer kampfbereiten Pose für stärkere Esports-Wirkung',
      confidence: 0.65,
    });
  }

  return items;
}
