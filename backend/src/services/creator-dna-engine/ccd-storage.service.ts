import type {
  CharacterDNA,
  CreatorPreferencesDNA,
  CharacterEvolutionProposal,
  CcdLearningSignal,
} from '@ucbs/shared';
import { dsGet, dsSet, dsList } from '../../lib/data-store.js';

const CHARACTER_COLLECTION = 'ccd_character_dna';
const PREFERENCES_COLLECTION = 'ccd_creator_preferences';
const EVOLUTION_COLLECTION = 'ccd_evolution_proposals';

export async function getCharacterDna(userId: string): Promise<CharacterDNA | null> {
  const doc = await dsGet(CHARACTER_COLLECTION, userId);
  return doc ? (doc as unknown as CharacterDNA) : null;
}

export async function saveCharacterDna(character: CharacterDNA): Promise<void> {
  await dsSet(CHARACTER_COLLECTION, character.userId, character as unknown as Record<string, unknown>);
}

export async function getCreatorPreferences(userId: string): Promise<CreatorPreferencesDNA | null> {
  const doc = await dsGet(PREFERENCES_COLLECTION, userId);
  return doc ? (doc as unknown as CreatorPreferencesDNA) : null;
}

export async function saveCreatorPreferences(prefs: CreatorPreferencesDNA): Promise<void> {
  await dsSet(PREFERENCES_COLLECTION, prefs.userId, prefs as unknown as Record<string, unknown>);
}

export async function listEvolutionProposals(userId: string): Promise<CharacterEvolutionProposal[]> {
  const items = await dsList(EVOLUTION_COLLECTION, { userId, orderBy: 'createdAt', order: 'desc', limit: 10 });
  return items as unknown as CharacterEvolutionProposal[];
}

export async function saveEvolutionProposal(proposal: CharacterEvolutionProposal): Promise<void> {
  await dsSet(EVOLUTION_COLLECTION, proposal.id, {
    ...proposal,
    userId: proposal.userId,
  } as unknown as Record<string, unknown>);
}

export async function getEvolutionProposal(
  id: string,
  userId: string
): Promise<CharacterEvolutionProposal | null> {
  const doc = await dsGet(EVOLUTION_COLLECTION, id);
  if (!doc || doc.userId !== userId) return null;
  return doc as unknown as CharacterEvolutionProposal;
}

export async function updateEvolutionProposal(proposal: CharacterEvolutionProposal): Promise<void> {
  await saveEvolutionProposal(proposal);
}

/** Lernsignale aus MAGIK-Events für CCD Creator Preferences. */
export async function getCcdLearningSignals(): Promise<CcdLearningSignal[]> {
  const events = await dsList('magik_learning_events', { orderBy: 'createdAt', order: 'desc', limit: 500 });
  return events.map((e) => ({
    eventType: e.eventType as CcdLearningSignal['eventType'],
    style: e.profile && typeof e.profile === 'object' ? (e.profile as { magikStyle?: string }).magikStyle : undefined,
    game: e.profile && typeof e.profile === 'object' ? (e.profile as { game?: string }).game : undefined,
    background:
      e.profile && typeof e.profile === 'object'
        ? (e.profile as { magikBackground?: string }).magikBackground
        : undefined,
  }));
}
