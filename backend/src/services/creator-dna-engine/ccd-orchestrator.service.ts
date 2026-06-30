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

export async function getCcdPromptContext(userId: string) {
  const [characterDna, creatorPreferences] = await Promise.all([
    getCharacterDna(userId),
    getCreatorPreferences(userId),
  ]);
  return { characterDna, creatorPreferences };
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
