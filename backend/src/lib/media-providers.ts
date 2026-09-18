import {
  isProduction,
  getElevenLabsApiKey,
  getElevenLabsVoiceId,
  getReplicateApiToken,
  getSunoApiKey,
  getRunwayApiKey,
  getReplicateVideoModel,
  getMusicProviderPreference,
  hasImageAiProvider,
  hasVideoAiProvider,
  hasMusicAiProvider,
  areGenerationsEnabled,
  areImageGenerationsEnabled,
  areVideoGenerationsEnabled,
  areMusicGenerationsEnabled,
  isTtsGenerationEnabled,
} from '../config/env.js';
import { ServiceError } from './errors.js';
import { MUSIC_PROVIDER_FAILED_MESSAGE } from './safe-provider-fetch.js';
import {
  MUSIC_PROVIDERS,
  checkMusicDuration,
  clampVoiceSetting,
  defaultVoiceSettings,
  type MusicProviderId,
  type VoiceSettings,
  PRODUCT_NAME,
} from '@ucbs/shared';

const UNOFFICIAL_SUNO_DISABLED_MESSAGE =
  'Der inoffizielle Suno-Endpunkt ist deaktiviert. Es ist kein offizieller Suno-Endpunkt konfiguriert. Musik läuft über MusicGen, wenn REPLICATE_API_TOKEN gesetzt ist.';

export const ELEVENLABS_TTS_TIMEOUT_MS = 30_000;
export const PROVIDER_POLL_TIMEOUT_MS = 20_000;
export const RUNWAY_HTTP_TIMEOUT_MS = 30_000;
export const REPLICATE_MUSIC_CREATE_TIMEOUT_MS = 130_000;
export const REPLICATE_VIDEO_CREATE_TIMEOUT_MS = 190_000;
export const REPLICATE_THUMB_CREATE_TIMEOUT_MS = 100_000;

function throwProviderTimeout(message: string): never {
  throw new ServiceError(504, 'PROVIDER_TIMEOUT', message);
}

function throwProviderFailed(message: string): never {
  throw new ServiceError(502, 'PROVIDER_ERROR', message);
}

async function providerFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throwProviderTimeout('Der Provider hat nicht rechtzeitig geantwortet. Coins wurden erstattet.');
    }
    throwProviderFailed('Die Provider-Anfrage ist fehlgeschlagen. Coins wurden erstattet.');
  }
}

export type MusicProviderLimits =
  | { ok: true; id: MusicProviderId; maxDurationSec: number; label: string }
  | { ok: false; message: string; code: 'MUSIC_PROVIDER_DISABLED' | 'AI_NOT_CONFIGURED' };

export function getMusicProviderLimits(): MusicProviderLimits {
  const pref = getMusicProviderPreference()?.toLowerCase();
  if (pref === 'suno') {
    return { ok: false, message: UNOFFICIAL_SUNO_DISABLED_MESSAGE, code: 'MUSIC_PROVIDER_DISABLED' };
  }
  if (pref && pref !== 'replicate' && pref !== 'replicate-musicgen') {
    return {
      ok: false,
      message: `Unbekannter MUSIC_PROVIDER „${pref}“. Unterstützt: replicate (MusicGen). Offizielles Suno ist nicht konfiguriert.`,
      code: 'MUSIC_PROVIDER_DISABLED',
    };
  }
  if (!areMusicGenerationsEnabled()) {
    return { ok: false, message: MUSIC_PROVIDER_UNAVAILABLE_MESSAGE, code: 'AI_NOT_CONFIGURED' };
  }
  if (!getReplicateApiToken()) {
    if (getSunoApiKey()) {
      return { ok: false, message: UNOFFICIAL_SUNO_DISABLED_MESSAGE, code: 'MUSIC_PROVIDER_DISABLED' };
    }
    return {
      ok: false,
      message: 'Musik-Generierung benötigt REPLICATE_API_TOKEN (MusicGen).',
      code: 'AI_NOT_CONFIGURED',
    };
  }
  const spec = MUSIC_PROVIDERS['replicate-musicgen'];
  return { ok: true, id: spec.id, maxDurationSec: spec.maxDurationSec, label: spec.label };
}

function requireMusicProviderLimits(): Extract<MusicProviderLimits, { ok: true }> {
  const limits = getMusicProviderLimits();
  if (!limits.ok) {
    throw new ServiceError(503, limits.code, limits.message);
  }
  return limits;
}

export const MUSIC_PROVIDER_UNAVAILABLE_CODE = 'MUSIC_PROVIDER_UNAVAILABLE';
export const MUSIC_PROVIDER_UNAVAILABLE_MESSAGE =
  'Die Musikgenerierung ist momentan nicht verfügbar. Es wurden keine Coins abgebucht.';

export function throwMusicProviderUnavailable(): never {
  throw new ServiceError(503, MUSIC_PROVIDER_UNAVAILABLE_CODE, MUSIC_PROVIDER_UNAVAILABLE_MESSAGE);
}

export function requireMusicProvider(): void {
  if (isPaidProviderTestBlocked() || !hasMusicAiProvider()) {
    throwMusicProviderUnavailable();
  }
}

export function assertMusicDurationSupported(durationSec: number): number {
  const limits = requireMusicProviderLimits();
  const check = checkMusicDuration(durationSec, limits.maxDurationSec);
  if (!check.ok) {
    throw new ServiceError(400, 'MUSIC_DURATION_UNSUPPORTED', check.message);
  }
  return durationSec;
}

export async function generateSpeech(
  text: string,
  options?: { voiceId?: string; settings?: VoiceSettings }
): Promise<{ audioUrl: string; provider: string }> {
  if (isPaidProviderTestBlocked()) {
    throw new ServiceError(
      503,
      'AI_NOT_CONFIGURED',
      'TTS-Generierung ist provider-gated und in Tests blockiert'
    );
  }
  if (!isTtsGenerationEnabled()) {
    throw new ServiceError(503, 'TTS_GENERATION_DISABLED', 'Provider-TTS ist deaktiviert.');
  }
  if (!areGenerationsEnabled()) {
    throw new ServiceError(503, 'GENERATIONS_DISABLED', 'KI-Generierung ist deaktiviert.');
  }
  const apiKey = getElevenLabsApiKey();
  if (!apiKey) {
    if (isProduction()) {
      throw new ServiceError(503, 'AI_NOT_CONFIGURED', 'ElevenLabs API Key fehlt (ELEVENLABS_API_KEY)');
    }
    throw new Error('ELEVENLABS_API_KEY nicht konfiguriert');
  }

  const voiceId = options?.voiceId || getElevenLabsVoiceId();
  const settings = options?.settings ?? defaultVoiceSettings();
  const res = await providerFetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: clampVoiceSetting('stability', settings.stability),
          similarity_boost: clampVoiceSetting('similarity', settings.similarity),
          style: clampVoiceSetting('style', settings.style),
          speed: clampVoiceSetting('speed', settings.speed),
        },
      }),
    },
    ELEVENLABS_TTS_TIMEOUT_MS
  );

  if (!res.ok) {
    throw new ServiceError(502, 'PROVIDER_ERROR', 'Provider-TTS ist fehlgeschlagen. Coins wurden erstattet.');
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const dataUrl = `data:audio/mpeg;base64,${buffer.toString('base64')}`;
  return { audioUrl: dataUrl, provider: 'elevenlabs' };
}

export async function generateMusic(
  prompt: string,
  options?: { duration?: number; title?: string }
): Promise<{ audioUrl: string; provider: string; duration: number }> {
  if (isPaidProviderTestBlocked()) {
    throw new ServiceError(
      503,
      'AI_NOT_CONFIGURED',
      'Musik-Generierung ist provider-gated und in Tests blockiert'
    );
  }
  if (!areGenerationsEnabled()) {
    throw new ServiceError(503, 'GENERATIONS_DISABLED', 'KI-Generierung ist deaktiviert.');
  }
  if (!areMusicGenerationsEnabled() || !hasMusicAiProvider()) {
    throwMusicProviderUnavailable();
  }
  const limits = requireMusicProviderLimits();
  const requested = options?.duration ?? limits.maxDurationSec;
  const duration = assertMusicDurationSupported(requested);

  if (limits.id === 'replicate-musicgen') {
    return generateMusicWithReplicate(prompt, duration);
  }

  throw new ServiceError(
    503,
    'MUSIC_PROVIDER_DISABLED',
    'Kein unterstützter Musik-Provider aktiv. Offizielle zusätzliche Provider können später über MUSIC_PROVIDER gewählt werden.'
  );
}

async function generateMusicWithReplicate(
  prompt: string,
  duration: number
): Promise<{ audioUrl: string; provider: string; duration: number }> {
  const token = getReplicateApiToken()!;
  const createRes = await providerFetch(
    'https://api.replicate.com/v1/models/meta/musicgen/predictions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'wait=120',
      },
      body: JSON.stringify({
        input: {
          prompt,
          duration,
          model_version: 'stereo-large',
        },
      }),
    },
    REPLICATE_MUSIC_CREATE_TIMEOUT_MS
  );

  if (!createRes.ok) {
    throwProviderFailed(MUSIC_PROVIDER_FAILED_MESSAGE);
  }

  let prediction = (await createRes.json()) as {
    id: string;
    status: string;
    output?: string | string[];
    error?: string;
  };

  let attempts = 0;
  while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && attempts < 90) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await providerFetch(
      `https://api.replicate.com/v1/predictions/${prediction.id}`,
      { headers: { Authorization: `Bearer ${token}` } },
      PROVIDER_POLL_TIMEOUT_MS
    );
    prediction = await pollRes.json();
    attempts++;
  }

  const output = prediction.output;
  const audioUrl = Array.isArray(output) ? output[0] : output;
  if (prediction.status === 'failed' || typeof audioUrl !== 'string' || !audioUrl.trim()) {
    throwProviderFailed(MUSIC_PROVIDER_FAILED_MESSAGE);
  }

  return { audioUrl, provider: 'replicate-musicgen', duration };
}

async function generateMusicWithSuno(
  prompt: string,
  options?: { duration?: number; title?: string }
): Promise<{ audioUrl: string; provider: string; duration: number }> {
  throw new ServiceError(503, 'MUSIC_PROVIDER_DISABLED', UNOFFICIAL_SUNO_DISABLED_MESSAGE);

  // Retained unofficial request shape for a future official adapter — never executed.
  const res = await fetch('https://api.sunoapi.org/api/v1/generate', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getSunoApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      title: options?.title || `${PRODUCT_NAME} Track`,
      duration: options?.duration || 120,
    }),
  });

  if (!res.ok) {
    throw new Error(`Suno API error: ${await res.text()}`);
  }

  const data = (await res.json()) as { audio_url?: string; url?: string };
  const audioUrl = data.audio_url || data.url;
  if (!audioUrl) {
    throw new Error('Suno returned no audio URL');
  }

  return {
    audioUrl: audioUrl as string,
    provider: 'suno',
    duration: options?.duration || 120,
  };
}

export async function generateVideoThumbnail(
  prompt: string
): Promise<{ imageUrl: string; provider: string }> {
  if (isPaidProviderTestBlocked()) {
    throw new ServiceError(
      503,
      'AI_NOT_CONFIGURED',
      'Video-Thumbnails sind provider-gated und in Tests blockiert'
    );
  }
  if (!areGenerationsEnabled()) {
    throw new ServiceError(503, 'GENERATIONS_DISABLED', 'KI-Generierung ist deaktiviert.');
  }
  if (!areImageGenerationsEnabled()) {
    throwImageGenerationUnavailable();
  }
  const token = getReplicateApiToken();
  if (!token) {
    if (isProduction()) {
      throw new ServiceError(503, 'AI_NOT_CONFIGURED', 'REPLICATE_API_TOKEN fehlt für Video-Thumbnails');
    }
    throw new Error('REPLICATE_API_TOKEN nicht konfiguriert');
  }

  const createRes = await providerFetch(
    'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'wait=90',
      },
      body: JSON.stringify({
        input: { prompt, num_outputs: 1, aspect_ratio: '16:9' },
      }),
    },
    REPLICATE_THUMB_CREATE_TIMEOUT_MS
  );

  if (!createRes.ok) {
    throwProviderFailed('Die Bildgenerierung ist fehlgeschlagen. Coins wurden erstattet.');
  }

  const prediction = (await createRes.json()) as {
    status: string;
    output?: string | string[];
    error?: string;
  };

  if (prediction.status === 'failed') {
    throwProviderFailed('Die Bildgenerierung ist fehlgeschlagen. Coins wurden erstattet.');
  }

  const output = prediction.output;
  const imageUrl = Array.isArray(output) ? output[0] : output;
  if (!imageUrl) {
    throwProviderFailed('Die Bildgenerierung ist fehlgeschlagen. Coins wurden erstattet.');
  }

  return { imageUrl, provider: 'replicate-flux' };
}

export function isPaidProviderTestBlocked(): boolean {
  return (
    Boolean(process.env.NODE_TEST) ||
    process.execArgv.includes('--test') ||
    process.argv.includes('--test') ||
    process.argv.some((arg) => /\.test\.[cm]?ts$/.test(arg.replace(/\\/g, '/')))
  );
}

/** Pre-debit: no live OpenAI images and no other allowed image provider (Replicate). */
export const IMAGE_GENERATION_UNAVAILABLE_CODE = 'IMAGE_GENERATION_UNAVAILABLE';
export const IMAGE_GENERATION_UNAVAILABLE_MESSAGE =
  'Die Bildgenerierung ist momentan nicht verfügbar. Es wurden keine Coins abgebucht.';
export const IMAGE_PROVIDER_FAILED_MESSAGE =
  'Die Bildgenerierung ist fehlgeschlagen. Coins wurden erstattet.';

export function throwImageGenerationUnavailable(): never {
  throw new ServiceError(503, IMAGE_GENERATION_UNAVAILABLE_CODE, IMAGE_GENERATION_UNAVAILABLE_MESSAGE);
}

export function throwImageProviderUnavailableAfterDebit(): never {
  throw new ServiceError(503, 'PROVIDER_UNAVAILABLE', IMAGE_PROVIDER_FAILED_MESSAGE);
}

export function requireImageProvider(): void {
  if (isPaidProviderTestBlocked() || !hasImageAiProvider()) {
    throwImageGenerationUnavailable();
  }
}

export const VIDEO_PROVIDER_UNAVAILABLE_CODE = 'VIDEO_PROVIDER_UNAVAILABLE';
export const VIDEO_PROVIDER_UNAVAILABLE_MESSAGE =
  'Die KI-Videogenerierung ist momentan nicht verfügbar. Es wurden keine Coins abgebucht.';
export const VIDEO_PROVIDER_FAILED_MESSAGE =
  'Die KI-Videogenerierung ist fehlgeschlagen. Coins wurden erstattet.';

export function throwVideoProviderUnavailable(): never {
  throw new ServiceError(503, VIDEO_PROVIDER_UNAVAILABLE_CODE, VIDEO_PROVIDER_UNAVAILABLE_MESSAGE);
}

export function requireVideoProvider(): void {
  if (isPaidProviderTestBlocked() || !hasVideoAiProvider()) {
    throwVideoProviderUnavailable();
  }
}

export type VideoAspectRatio = '16:9' | '9:16';

export async function generateVideo(
  prompt: string,
  options?: { aspectRatio?: VideoAspectRatio; duration?: number; imageUrl?: string }
): Promise<{ videoUrl: string; provider: string; imageToVideo?: boolean }> {
  if (isPaidProviderTestBlocked()) {
    throw new ServiceError(
      503,
      'AI_NOT_CONFIGURED',
      'Video-Generierung ist provider-gated und in Tests blockiert'
    );
  }
  if (!areGenerationsEnabled()) {
    throw new ServiceError(503, 'GENERATIONS_DISABLED', 'KI-Generierung ist deaktiviert.');
  }
  if (!areVideoGenerationsEnabled()) {
    throwVideoProviderUnavailable();
  }
  if (getRunwayApiKey()) {
    return generateVideoWithRunway(prompt, options);
  }
  if (getReplicateApiToken()) {
    return generateVideoWithReplicate(prompt, options);
  }
  throw new ServiceError(
    503,
    'AI_NOT_CONFIGURED',
    'Video-Generierung benötigt RUNWAY_API_KEY oder REPLICATE_API_TOKEN'
  );
}

async function generateVideoWithReplicate(
  prompt: string,
  options?: { aspectRatio?: VideoAspectRatio; duration?: number; imageUrl?: string }
): Promise<{ videoUrl: string; provider: string; imageToVideo?: boolean }> {
  const token = getReplicateApiToken()!;
  const model = getReplicateVideoModel();
  const aspectRatio = options?.aspectRatio === '9:16' ? '9:16' : '16:9';
  const input: Record<string, unknown> = {
    prompt,
    prompt_optimizer: true,
    aspect_ratio: aspectRatio,
  };
  if (options?.imageUrl) {
    input.start_image = options.imageUrl;
    input.image = options.imageUrl;
  }

  const createRes = await providerFetch(
    `https://api.replicate.com/v1/models/${model}/predictions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'wait=180',
      },
      body: JSON.stringify({
        input,
      }),
    },
    REPLICATE_VIDEO_CREATE_TIMEOUT_MS
  );

  if (!createRes.ok) {
    throwProviderFailed(VIDEO_PROVIDER_FAILED_MESSAGE);
  }

  let prediction = (await createRes.json()) as {
    id: string;
    status: string;
    output?: string | string[];
    error?: string;
  };

  let attempts = 0;
  while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && attempts < 120) {
    await new Promise((r) => setTimeout(r, 3000));
    const pollRes = await providerFetch(
      `https://api.replicate.com/v1/predictions/${prediction.id}`,
      { headers: { Authorization: `Bearer ${token}` } },
      PROVIDER_POLL_TIMEOUT_MS
    );
    prediction = await pollRes.json();
    attempts++;
  }

  if (prediction.status === 'failed') {
    throwProviderFailed(VIDEO_PROVIDER_FAILED_MESSAGE);
  }

  const output = prediction.output;
  const videoUrl = Array.isArray(output) ? output[0] : output;
  if (!videoUrl || typeof videoUrl !== 'string') {
    throwProviderFailed(VIDEO_PROVIDER_FAILED_MESSAGE);
  }

  return { videoUrl, provider: `replicate:${model}`, imageToVideo: Boolean(options?.imageUrl) };
}

async function generateVideoWithRunway(
  prompt: string,
  options?: { aspectRatio?: VideoAspectRatio; duration?: number }
): Promise<{ videoUrl: string; provider: string }> {
  const apiKey = getRunwayApiKey()!;
  const ratio = options?.aspectRatio === '9:16' ? '720:1280' : '1280:720';
  const duration = Math.min(Math.max(options?.duration ?? 5, 5), 10);

  const createRes = await providerFetch(
    'https://api.dev.runwayml.com/v1/text_to_video',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Runway-Version': '2024-11-06',
      },
      body: JSON.stringify({
        model: 'gen3a_turbo',
        promptText: prompt,
        duration,
        ratio,
      }),
    },
    RUNWAY_HTTP_TIMEOUT_MS
  );

  if (!createRes.ok) {
    throwProviderFailed(VIDEO_PROVIDER_FAILED_MESSAGE);
  }

  const task = (await createRes.json()) as { id: string };
  let attempts = 0;

  while (attempts < 120) {
    await new Promise((r) => setTimeout(r, 3000));
    const pollRes = await providerFetch(
      `https://api.dev.runwayml.com/v1/tasks/${task.id}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'X-Runway-Version': '2024-11-06',
        },
      },
      PROVIDER_POLL_TIMEOUT_MS
    );

    if (!pollRes.ok) {
      throwProviderFailed(VIDEO_PROVIDER_FAILED_MESSAGE);
    }

    const result = (await pollRes.json()) as {
      status: string;
      output?: string[];
      failure?: string;
      failureCode?: string;
    };

    if (result.status === 'SUCCEEDED' && result.output?.[0]) {
      return { videoUrl: result.output[0], provider: 'runway-gen3a' };
    }

    if (result.status === 'FAILED') {
      throwProviderFailed(VIDEO_PROVIDER_FAILED_MESSAGE);
    }

    attempts++;
  }

  throwProviderTimeout(VIDEO_PROVIDER_FAILED_MESSAGE);
}
