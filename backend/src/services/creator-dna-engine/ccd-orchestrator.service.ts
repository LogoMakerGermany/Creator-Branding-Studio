import type { CreatorDNA, LogoGenerationOptions } from '@ucbs/shared';
import {
  buildCharacterDNA,
  buildCreatorPreferencesDNA,
  proposeCharacterEvolution,
  applyEvolutionProposal,
  buildCcdRecommendations,
  characterDnaToPromptPhrase,
} from '@ucbs/shared';
import {
  getCharacterDna,
  saveCharacterDna,
  getCreatorPreferences,
  saveCreatorPreferences,
  listEvolutionProposals,
  saveEvolutionProposal,
  getEvolutionProposal,
  updateEvolutionProposal,
  getCcdLearningSignals,
} from './ccd-storage.service.js';

export async function getCcdPromptContext(userId: string, projectId?: string) {
  const { resolveDnaForRequest } = await import('../dna.service.js');
  const [{ dna }, characterDna, creatorPreferences] = await Promise.all([
    resolveDnaForRequest(userId, projectId),
    getCharacterDna(userId),
    getCreatorPreferences(userId),
  ]);

  if (dna?.character?.present || dna?.mascot || dna?.character?.description) {
    const figure = dna.character?.description || dna.mascot || dna.name;
    const merged = characterDna
      ? {
          ...characterDna,
          creatorDnaId: dna.id,
          creatorName: dna.name,
          figure,
          visual: {
            ...characterDna.visual,
            clothing: dna.character?.clothing ?? characterDna.visual.clothing,
            hair: dna.character?.hair ?? characterDna.visual.hair,
            mask: dna.character?.face ?? characterDna.visual.mask,
            jewelry: dna.character?.accessories ?? characterDna.visual.jewelry,
          },
        }
      : {
          id: dna.character?.ccdCharacterId ?? dna.id,
          userId,
          creatorDnaId: dna.id,
          creatorName: dna.name,
          clanName: dna.clanName,
          figure,
          subFigure: dna.character?.type,
          personality: 'heroic' as const,
          style: dna.styleDirection,
          visual: {
            clothing: dna.character?.clothing,
            hair: dna.character?.hair,
            mask: dna.character?.face,
            jewelry: dna.character?.accessories,
          },
          colors: {
            primary: dna.primaryColors,
            secondary: dna.secondaryColors,
            accent: dna.accentColors,
            glow: [],
            metal: [],
            lighting: dna.atmosphere?.lighting ? [dna.atmosphere.lighting] : [],
          },
          effects: [],
          pose: 'heroic' as const,
          environment: 'abstract' as const,
          generationCount: 0,
          version: dna.version,
          createdAt: dna.createdAt,
          updatedAt: dna.updatedAt,
        };
    return { characterDna: merged, creatorPreferences, source: 'creator_dna' as const };
  }

  return { characterDna, creatorPreferences, source: characterDna ? ('ccd_sidecar' as const) : ('none' as const) };
}

/** Nach Logo-Generierung: Character DNA erstellen/erweitern. */
export async function processLogoGenerationCcd(
  userId: string,
  creatorDna: CreatorDNA,
  opts: LogoGenerationOptions,
  jobId: string,
  imageUrl?: string
) {
  const [existing, prefsExisting, signals] = await Promise.all([
    getCharacterDna(userId),
    getCreatorPreferences(userId),
    getCcdLearningSignals(),
  ]);

  const character = buildCharacterDNA({
    userId,
    creatorDna,
    opts,
    existing,
    jobId,
    imageUrl,
  });

  const preferences = buildCreatorPreferencesDNA(
    userId,
    creatorDna,
    opts,
    prefsExisting,
    signals
  );

  await Promise.all([saveCharacterDna(character), saveCreatorPreferences(preferences)]);

  if (!creatorDna.locks?.character && !creatorDna.locks?.mascot) {
    const emptyCharacter = !creatorDna.character?.description && !creatorDna.mascot;
    if (emptyCharacter) {
      const { updateDna } = await import('../dna.service.js');
      await updateDna(
        creatorDna.id,
        userId,
        {
          userId,
          name: creatorDna.name,
          mascot: character.figure,
          character: {
            present: true,
            type: character.figure,
            description: character.figure,
            clothing: character.visual.armor || character.visual.clothing,
            hair: character.visual.hair,
            face: character.visual.mask || character.visual.helmet,
            accessories: character.visual.jewelry,
            ccdCharacterId: character.id,
          },
        },
        'Character aus Logo übernommen'
      ).catch(() => undefined);
    }
  }

  const evolution = proposeCharacterEvolution(character, {
    jobId,
    style: opts.magikStyle ?? opts.style,
    imageUrl,
  });
  if (evolution) {
    await saveEvolutionProposal(evolution);
  }

  return { character, preferences, evolution };
}

export function appendCcdToPrompt(prompt: string, characterDna: Awaited<ReturnType<typeof getCharacterDna>>): string {
  if (!characterDna) return prompt;
  return `${prompt} ${characterDnaToPromptPhrase(characterDna)}.`;
}

export async function getCcdDashboard(userId: string) {
  const [character, preferences, evolutions] = await Promise.all([
    getCharacterDna(userId),
    getCreatorPreferences(userId),
    listEvolutionProposals(userId),
  ]);

  return {
    character,
    preferences,
    pendingEvolutions: evolutions.filter((e) => e.status === 'pending'),
    recommendations: buildCcdRecommendations(character, preferences),
  };
}

export async function acceptEvolutionProposal(userId: string, proposalId: string) {
  const proposal = await getEvolutionProposal(proposalId, userId);
  if (!proposal || proposal.status !== 'pending') return null;

  const character = await getCharacterDna(userId);
  if (!character) return null;

  const updated = applyEvolutionProposal(character, proposal);
  proposal.status = 'accepted';
  await Promise.all([saveCharacterDna(updated), updateEvolutionProposal(proposal)]);
  return { character: updated, proposal };
}

export async function rejectEvolutionProposal(userId: string, proposalId: string) {
  const proposal = await getEvolutionProposal(proposalId, userId);
  if (!proposal || proposal.status !== 'pending') return null;
  proposal.status = 'rejected';
  await updateEvolutionProposal(proposal);
  return proposal;
}
