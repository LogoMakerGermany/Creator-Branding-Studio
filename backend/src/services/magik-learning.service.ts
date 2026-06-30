import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { dsSet, dsList } from '../lib/data-store.js';

const COLLECTION = 'magik_learning_events';

export type MagikLearningEventType = 'download' | 'delete' | 'favorite' | 'regenerate';

export interface MagikLearningProfile {
  magikMode?: string;
  magikStyle?: string;
  game?: string;
  magikCharacter?: string;
  magikLogoArt?: string;
  magikBackground?: string;
}

export interface MagikLearningEvent {
  id: string;
  eventType: MagikLearningEventType;
  variant?: 'a' | 'b';
  profile: MagikLearningProfile;
  promptHash: string;
  createdAt: string;
}

function hashPrompt(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex').slice(0, 16);
}

function profileKey(profile: MagikLearningProfile): string {
  return [
    profile.magikMode,
    profile.magikStyle,
    profile.game,
    profile.magikLogoArt,
    profile.magikBackground,
  ]
    .filter(Boolean)
    .join('|')
    .toLowerCase();
}

export type MagikLearningHints = {
  variantA?: string;
  variantB?: string;
};

/** Leitet aus anonymen Events Prompt-Booster ab — verbessert Auswahl über Zeit. */
export async function getMagikLearningHints(profile: MagikLearningProfile): Promise<MagikLearningHints> {
  const events = (await dsList(COLLECTION, {
    orderBy: 'createdAt',
    order: 'desc',
    limit: 5000,
  })) as unknown as MagikLearningEvent[];

  if (events.length < 8) return {};

  const key = profileKey(profile);
  const variantScores = { a: 0, b: 0 };
  let profilePositive = 0;
  let profileNegative = 0;

  for (const event of events) {
    const weight =
      event.eventType === 'download' || event.eventType === 'favorite'
        ? 1
        : event.eventType === 'delete'
          ? -1
          : event.eventType === 'regenerate'
            ? -0.35
            : 0;

    if (event.variant === 'a' || event.variant === 'b') {
      variantScores[event.variant] += weight;
    }

    const eventKey = profileKey(event.profile);
    if (key && (eventKey === key || eventKey.includes(key.split('|')[0] ?? ''))) {
      if (weight > 0) profilePositive += weight;
      if (weight < 0) profileNegative += Math.abs(weight);
    }
  }

  const hints: MagikLearningHints = {};

  if (variantScores.b > variantScores.a + 2) {
    hints.variantB =
      'MAGIK learning boost: users favor design-heavy logos — maximize particles, smoke, energy, creative AAA detail';
  } else if (variantScores.a > variantScores.b + 2) {
    hints.variantA =
      'MAGIK learning boost: users favor name-focused logos — maximize readable wordmark and title identity';
  }

  if (profilePositive > profileNegative + 2) {
    const polish =
      'MAGIK learned profile preference: intensify premium esports polish, glowing edges, metallic depth, cinematic contrast';
    hints.variantA = hints.variantA ? `${hints.variantA}. ${polish}` : polish;
    hints.variantB = hints.variantB ? `${hints.variantB}. ${polish}` : polish;
  }

  return hints;
}

/** Anonymes Lern-Event — ohne User-ID, nur aggregierte Prompt-Profile. */
export async function recordMagikLearningEvent(
  eventType: MagikLearningEventType,
  profile: MagikLearningProfile,
  prompt: string,
  variant?: 'a' | 'b'
): Promise<void> {
  const event: MagikLearningEvent = {
    id: randomUUID(),
    eventType,
    variant,
    profile,
    promptHash: hashPrompt(prompt),
    createdAt: new Date().toISOString(),
  };
  await dsSet(COLLECTION, event.id, event as unknown as Record<string, unknown>);
}

export async function getMagikLearningStats(): Promise<{
  total: number;
  byEvent: Record<MagikLearningEventType, number>;
}> {
  const events = (await dsList(COLLECTION, { orderBy: 'createdAt', order: 'desc', limit: 5000 })) as unknown as MagikLearningEvent[];
  const byEvent: Record<MagikLearningEventType, number> = {
    download: 0,
    delete: 0,
    favorite: 0,
    regenerate: 0,
  };
  for (const e of events) {
    if (e.eventType in byEvent) byEvent[e.eventType]++;
  }
  return { total: events.length, byEvent };
}
