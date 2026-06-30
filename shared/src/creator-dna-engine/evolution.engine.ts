import type { CharacterDNA, CharacterEvolutionProposal } from './types';

function evolutionId(): string {
  return `evo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export type EvolutionSource = {
  jobId?: string;
  style?: string;
  imageUrl?: string;
  prompt?: string;
};

/** Evolution Engine — schlägt Erweiterungen nach erfolgreicher Generierung vor. */
export function proposeCharacterEvolution(
  character: CharacterDNA,
  source: EvolutionSource
): CharacterEvolutionProposal | null {
  if (character.generationCount < 1) return null;

  const proposals: CharacterEvolutionProposal[] = [];
  const now = new Date().toISOString();

  if (source.style?.includes('Fire') && !character.effects.includes('lava')) {
    proposals.push({
      id: evolutionId(),
      userId: character.userId,
      characterDnaId: character.id,
      description: 'Feuer-Evolution: Lava-Effekte und glühende Rüstung',
      changes: {
        effects: [...character.effects, 'lava', 'fire'].slice(0, 8) as CharacterEvolutionProposal['changes']['effects'],
        visual: { armor: 'molten lava-infused battle armor' },
      },
      status: 'pending',
      sourceJobId: source.jobId,
      createdAt: now,
    });
  }

  if (source.style?.includes('Ice') && !character.visual.scales) {
    proposals.push({
      id: evolutionId(),
      userId: character.userId,
      characterDnaId: character.id,
      description: 'Eis-Evolution: Kristallpanzer und Frostaura',
      changes: {
        effects: [...character.effects, 'ice', 'crystals'].slice(0, 8) as CharacterEvolutionProposal['changes']['effects'],
        visual: { armor: 'frost crystal armor plating', scales: 'ice crystal scales' },
        environment: 'ice-world',
      },
      status: 'pending',
      sourceJobId: source.jobId,
      createdAt: now,
    });
  }

  if (character.generationCount >= 2 && !character.visual.scars) {
    proposals.push({
      id: evolutionId(),
      userId: character.userId,
      characterDnaId: character.id,
      description: 'Kampf-Evolution: Narben und verstärkte Ausrüstung',
      changes: {
        visual: { scars: 'battle-hardened scars', armor: character.visual.armor ?? 'upgraded elite armor' },
        pose: 'combat-ready',
      },
      status: 'pending',
      sourceJobId: source.jobId,
      createdAt: now,
    });
  }

  return proposals[0] ?? null;
}

export function applyEvolutionProposal(
  character: CharacterDNA,
  proposal: CharacterEvolutionProposal
): CharacterDNA {
  const now = new Date().toISOString();
  const { changes } = proposal;

  return {
    ...character,
    visual: { ...character.visual, ...changes.visual },
    colors: { ...character.colors, ...changes.colors },
    effects: changes.effects ?? character.effects,
    pose: changes.pose ?? character.pose,
    environment: changes.environment ?? character.environment,
    version: character.version + 1,
    updatedAt: now,
  };
}
