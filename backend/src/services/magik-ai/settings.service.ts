import type { MagikAiSettings } from '@ucbs/shared';
import { DEFAULT_MAGIK_AI_SETTINGS } from '@ucbs/shared';
import { dsGet, dsSet } from '../../lib/data-store.js';

const COLLECTION = 'magik_ai_settings';

export async function getMagikAiSettings(userId: string): Promise<MagikAiSettings> {
  const stored = await dsGet(COLLECTION, userId);
  if (!stored) return { ...DEFAULT_MAGIK_AI_SETTINGS };
  const raw = stored as unknown as MagikAiSettings;
  const { assistantEnabled, animationsEnabled, voiceEnabled, personalityId, language, updatedAt } = raw;
  return {
    assistantEnabled: Boolean(assistantEnabled),
    animationsEnabled: Boolean(animationsEnabled),
    voiceEnabled: Boolean(voiceEnabled),
    personalityId: (personalityId as MagikAiSettings['personalityId']) ?? 'mentor',
    language: typeof language === 'string' ? language : 'de',
    updatedAt: typeof updatedAt === 'string' ? updatedAt : undefined,
  };
}

/** Speichert Einstellungen — Feature-Toggles bleiben bis Phase 2 gesperrt. */
export async function saveMagikAiSettings(
  userId: string,
  patch: Partial<MagikAiSettings>
): Promise<MagikAiSettings> {
  const current = await getMagikAiSettings(userId);
  const next: MagikAiSettings = {
    ...current,
    personalityId: patch.personalityId ?? current.personalityId,
    language: patch.language ?? current.language,
    assistantEnabled: false,
    animationsEnabled: false,
    voiceEnabled: false,
    updatedAt: new Date().toISOString(),
  };
  await dsSet(COLLECTION, userId, { userId, ...next } as unknown as Record<string, unknown>);
  return next;
}
