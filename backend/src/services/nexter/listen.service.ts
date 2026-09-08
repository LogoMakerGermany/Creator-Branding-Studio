import { isPaidProviderTestBlocked } from '../../lib/media-providers.js';
import { ServiceError } from '../../lib/errors.js';
import { LISTEN_PROVIDER_BLOCKED_MESSAGE } from '../../lib/provider-gate.js';

export async function transcribeNexterAudio(
  audioBase64: string,
  mimeType: string,
  language?: string
): Promise<string> {
  void mimeType;
  void language;
  const raw = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
  const buffer = Buffer.from(raw, 'base64');
  if (buffer.length < 64 || buffer.length > 4 * 1024 * 1024) {
    throw new ServiceError(400, 'AUDIO_INVALID', 'Audio zu klein oder zu groß');
  }

  if (isPaidProviderTestBlocked()) {
    throw new ServiceError(503, 'AI_NOT_CONFIGURED', LISTEN_PROVIDER_BLOCKED_MESSAGE);
  }

  throw new ServiceError(503, 'AI_NOT_CONFIGURED', LISTEN_PROVIDER_BLOCKED_MESSAGE);
}
