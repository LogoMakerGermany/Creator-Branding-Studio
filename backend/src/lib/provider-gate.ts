import { areGenerationsEnabled } from '../config/env.js';
import { ServiceError } from './errors.js';
import { dsGet, dsSet } from './data-store.js';
import { withDevLock } from './dev-mutex.js';
import { getSystemSettings } from '../services/system-settings.service.js';

const CHAT_USAGE_COLLECTION = 'nexter_chat_usage';
const CHAT_WINDOW_MS = 60 * 60 * 1000;
const CHAT_MAX_PER_WINDOW = 40;

export const LEGACY_IMAGE_GENERATE_MESSAGE =
  'Bildgenerierung startet nur über Nexter nach Bestätigung (Für X Coins erstellen).';
export const LEGACY_VIDEO_GENERATE_MESSAGE =
  'KI-Video startet nicht direkt. Nutze das Video-Studio oder ein bestätigtes Nexter-Angebot.';
export const LISTEN_PROVIDER_BLOCKED_MESSAGE =
  'Spracheingabe (Whisper) ist deaktiviert, bis eine bestätigte Kostenpolicy existiert. Nutze den Text-Chat.';
export const CAPTIONS_DIRECT_BLOCKED_MESSAGE =
  'Automatische Untertitel starten nur über Nexter nach Bestätigung. Direkter Provider-Aufruf ist deaktiviert.';
export const DNA_VISION_BLOCKED_MESSAGE =
  'DNA-Bildanalyse ist provider-gated, bis eine bestätigte Kostenpolicy existiert.';

export async function assertGenerationsKillSwitch(): Promise<void> {
  if (!areGenerationsEnabled()) {
    throw new ServiceError(503, 'GENERATIONS_DISABLED', 'KI-Generierung ist deaktiviert.');
  }
  const settings = await getSystemSettings();
  if (!settings.generationsEnabled) {
    throw new ServiceError(503, 'GENERATIONS_DISABLED', 'KI-Generierung ist deaktiviert.');
  }
}

export async function consumeNexterChatProviderSlot(userId: string): Promise<{ ok: boolean; count: number }> {
  return withDevLock(`nexter-chat-budget:${userId}`, async () => {
    const now = Date.now();
    const row = (await dsGet(CHAT_USAGE_COLLECTION, userId)) as
      | { windowStart?: number; count?: number }
      | null;
    const windowStart = typeof row?.windowStart === 'number' ? row.windowStart : 0;
    const count = typeof row?.count === 'number' ? row.count : 0;
    if (!windowStart || now - windowStart >= CHAT_WINDOW_MS) {
      await dsSet(CHAT_USAGE_COLLECTION, userId, { windowStart: now, count: 1 });
      return { ok: true, count: 1 };
    }
    if (count >= CHAT_MAX_PER_WINDOW) {
      return { ok: false, count };
    }
    const next = count + 1;
    await dsSet(CHAT_USAGE_COLLECTION, userId, { windowStart, count: next });
    return { ok: true, count: next };
  });
}
