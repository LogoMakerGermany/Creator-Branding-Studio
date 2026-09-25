import {
  areGenerationsEnabled,
  getOpenAiApiKey,
  isTextGenerationsFlagEnabled,
} from '../config/env.js';
import { ServiceError } from '../lib/errors.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';

export const TEXT_GENERATION_DISABLED_CODE = 'TEXT_GENERATION_DISABLED';
export const TEXT_GENERATION_DISABLED_MESSAGE =
  'Die Textgenerierung ist momentan nicht verfügbar. Es wurden keine Coins abgebucht.';

/**
 * Refuse live text generation before any coin debit or persisted job.
 * Test mocks pass mockActive=true and skip this gate.
 */
export function assertTextLiveProviderReady(mockActive: boolean): void {
  if (mockActive) return;
  if (!areGenerationsEnabled()) {
    throw new ServiceError(503, 'GENERATIONS_DISABLED', 'KI-Generierung ist deaktiviert.');
  }
  if (!isTextGenerationsFlagEnabled()) {
    throw new ServiceError(503, TEXT_GENERATION_DISABLED_CODE, TEXT_GENERATION_DISABLED_MESSAGE);
  }
  if (!getOpenAiApiKey()) {
    throw new ServiceError(503, 'AI_NOT_CONFIGURED', 'Textgenerierung benötigt OPENAI_API_KEY');
  }
  if (isPaidProviderTestBlocked()) {
    throw new ServiceError(
      503,
      'AI_NOT_CONFIGURED',
      'Textgenerierung ist provider-gated und in Tests blockiert'
    );
  }
}
