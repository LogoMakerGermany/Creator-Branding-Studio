import {
  GENERATED_VIDEO_DURATION_DEFAULT_SEC,
  GENERATED_VIDEO_DURATION_MAX_SEC,
  GENERATED_VIDEO_DURATION_MIN_SEC,
} from '@ucbs/shared';
import { getRunwayApiKey } from '../config/env.js';
import { ServiceError } from './errors.js';
import { isSafeAssetUrl } from './upload-validation.js';

/**
 * NEXTER primary Runway video model.
 * Official source: docs.dev.runwayml.com/guides/models.md + /api.md (POST /v1/text_to_video model gen4.5).
 * gen4_turbo is image-to-video only and cannot cover text-only Intro/Outro/AI Video.
 * Retired gen3a_turbo is not used and has no fallback.
 */
export const RUNWAY_VIDEO_MODEL = 'gen4.5';
export const RUNWAY_API_VERSION = '2024-11-06';
export const RUNWAY_API_BASE = 'https://api.dev.runwayml.com';
export const RUNWAY_TEXT_TO_VIDEO_ENDPOINT = `${RUNWAY_API_BASE}/v1/text_to_video`;
export const RUNWAY_IMAGE_TO_VIDEO_ENDPOINT = `${RUNWAY_API_BASE}/v1/image_to_video`;
export const RUNWAY_TASKS_PATH = `${RUNWAY_API_BASE}/v1/tasks/`;

export const RUNWAY_HTTP_TIMEOUT_MS = 30_000;
export const RUNWAY_POLL_HTTP_TIMEOUT_MS = 20_000;
/** Official task docs: do not poll a given task more often than once every five seconds. */
export const RUNWAY_POLL_INTERVAL_MS = 5_000;
export const RUNWAY_MAX_POLLS = 72;
export const RUNWAY_PROMPT_MAX_CHARS = 1000;
export const RUNWAY_DURATION_MIN_SEC = GENERATED_VIDEO_DURATION_MIN_SEC;
export const RUNWAY_DURATION_MAX_SEC = GENERATED_VIDEO_DURATION_MAX_SEC;
export const RUNWAY_DEFAULT_DURATION_SEC = GENERATED_VIDEO_DURATION_DEFAULT_SEC;
export const RUNWAY_RATIO_16_9 = '1280:720' as const;
export const RUNWAY_RATIO_9_16 = '720:1280' as const;

export const VIDEO_PROVIDER_FAILED_MESSAGE =
  'Die KI-Videogenerierung ist fehlgeschlagen. Coins wurden erstattet.';
export const VIDEO_DURATION_UNSUPPORTED_CODE = 'VIDEO_DURATION_UNSUPPORTED';
export const VIDEO_RATIO_UNSUPPORTED_CODE = 'VIDEO_RATIO_UNSUPPORTED';
export const VIDEO_IMAGE_UNSUPPORTED_CODE = 'VIDEO_IMAGE_UNSUPPORTED';

const RETIRED_RUNWAY_MODELS = new Set(['gen3a_turbo', 'gen4_aleph']);

type RunwayFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

let runwayTestFetch: RunwayFetch | null = null;
let runwayPollIntervalForTests: number | null = null;
let runwayMaxPollsForTests: number | null = null;

export function setRunwayFetchForTests(fn: RunwayFetch | null): void {
  runwayTestFetch = fn;
}

export function setRunwayPollForTests(opts: { intervalMs?: number; maxPolls?: number } | null): void {
  if (!opts) {
    runwayPollIntervalForTests = null;
    runwayMaxPollsForTests = null;
    return;
  }
  runwayPollIntervalForTests = opts.intervalMs ?? null;
  runwayMaxPollsForTests = opts.maxPolls ?? null;
}

export function isRunwayVideoTestFetchActive(): boolean {
  return Boolean(runwayTestFetch);
}

export type RunwayVideoRatio = typeof RUNWAY_RATIO_16_9 | typeof RUNWAY_RATIO_9_16;
export type RunwayVideoMode = 'text_to_video' | 'image_to_video';

export type RunwayVideoCreateRequest = {
  endpoint: string;
  mode: RunwayVideoMode;
  body: {
    model: typeof RUNWAY_VIDEO_MODEL;
    promptText: string;
    ratio: RunwayVideoRatio;
    duration: number;
    promptImage?: Array<{ uri: string; position: 'first' }>;
  };
};

function throwProviderTimeout(): never {
  throw new ServiceError(504, 'PROVIDER_TIMEOUT', VIDEO_PROVIDER_FAILED_MESSAGE);
}

function throwProviderFailed(): never {
  throw new ServiceError(502, 'PROVIDER_ERROR', VIDEO_PROVIDER_FAILED_MESSAGE);
}

function isTestRuntime(): boolean {
  return (
    Boolean(process.env.NODE_TEST) ||
    process.execArgv.includes('--test') ||
    process.argv.includes('--test') ||
    process.argv.some((arg) => /\.test\.[cm]?ts$/.test(arg.replace(/\\/g, '/')))
  );
}

export function mapRunwayPrompt(prompt: string): string {
  const text = typeof prompt === 'string' ? prompt.trim() : '';
  if (!text) {
    throw new ServiceError(400, 'VIDEO_PROMPT_REQUIRED', 'Ein Videoprompt ist erforderlich.');
  }
  return text.length <= RUNWAY_PROMPT_MAX_CHARS ? text : text.slice(0, RUNWAY_PROMPT_MAX_CHARS);
}

export function mapRunwayRatio(aspect?: string): RunwayVideoRatio {
  if (aspect === undefined || aspect === '16:9') return RUNWAY_RATIO_16_9;
  if (aspect === '9:16') return RUNWAY_RATIO_9_16;
  throw new ServiceError(
    400,
    VIDEO_RATIO_UNSUPPORTED_CODE,
    'Dieses Seitenverhältnis wird für KI-Video nicht unterstützt.'
  );
}

export function mapRunwayDuration(duration?: number): number {
  if (duration === undefined) return RUNWAY_DEFAULT_DURATION_SEC;
  if (
    !Number.isInteger(duration) ||
    duration < RUNWAY_DURATION_MIN_SEC ||
    duration > RUNWAY_DURATION_MAX_SEC
  ) {
    throw new ServiceError(
      400,
      VIDEO_DURATION_UNSUPPORTED_CODE,
      `KI-Video unterstützt ${RUNWAY_DURATION_MIN_SEC}–${RUNWAY_DURATION_MAX_SEC} Sekunden. Ungültige Längen werden nicht an den Provider gesendet.`
    );
  }
  return duration;
}

export function assertRunwayImageInput(imageUrl: string): string {
  const raw = imageUrl.trim();
  if (!raw || !isSafeAssetUrl(raw)) {
    throw new ServiceError(
      400,
      VIDEO_IMAGE_UNSUPPORTED_CODE,
      'Das Referenzbild für KI-Video ist ungültig.'
    );
  }
  return raw;
}

export function assertRunwayOutputUrl(url: unknown): string {
  if (typeof url !== 'string' || !url.startsWith('https://')) {
    throwProviderFailed();
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host === '127.0.0.1' || host === '::1') {
      throwProviderFailed();
    }
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    throwProviderFailed();
  }
  return url;
}

export function buildRunwayVideoCreate(input: {
  prompt: string;
  aspectRatio?: string;
  duration?: number;
  imageUrl?: string;
}): RunwayVideoCreateRequest {
  const promptText = mapRunwayPrompt(input.prompt);
  const ratio = mapRunwayRatio(input.aspectRatio);
  const duration = mapRunwayDuration(input.duration);
  const imageUrl = typeof input.imageUrl === 'string' && input.imageUrl.trim() ? input.imageUrl : undefined;

  if (imageUrl) {
    const uri = assertRunwayImageInput(imageUrl);
    return {
      endpoint: RUNWAY_IMAGE_TO_VIDEO_ENDPOINT,
      mode: 'image_to_video',
      body: {
        model: RUNWAY_VIDEO_MODEL,
        promptText,
        ratio,
        duration,
        promptImage: [{ uri, position: 'first' }],
      },
    };
  }

  return {
    endpoint: RUNWAY_TEXT_TO_VIDEO_ENDPOINT,
    mode: 'text_to_video',
    body: {
      model: RUNWAY_VIDEO_MODEL,
      promptText,
      ratio,
      duration,
    },
  };
}

function assertActiveRunwayModel(model: string): void {
  if (RETIRED_RUNWAY_MODELS.has(model) || model !== RUNWAY_VIDEO_MODEL) {
    throw new ServiceError(503, 'VIDEO_PROVIDER_UNAVAILABLE', VIDEO_PROVIDER_FAILED_MESSAGE);
  }
}

async function runwayFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const fetchFn = runwayTestFetch ?? fetch;
  try {
    return await fetchFn(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throwProviderTimeout();
    }
    throwProviderFailed();
  }
}

function runwayHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'X-Runway-Version': RUNWAY_API_VERSION,
  };
}

export async function generateVideoWithRunway(
  prompt: string,
  options?: { aspectRatio?: '16:9' | '9:16'; duration?: number; imageUrl?: string }
): Promise<{ videoUrl: string; provider: string; imageToVideo?: boolean }> {
  if (isTestRuntime() && !runwayTestFetch) {
    throw new ServiceError(
      503,
      'AI_NOT_CONFIGURED',
      'Video-Generierung ist provider-gated und in Tests blockiert'
    );
  }

  const apiKey = getRunwayApiKey();
  if (!apiKey) {
    throw new ServiceError(503, 'AI_NOT_CONFIGURED', VIDEO_PROVIDER_FAILED_MESSAGE);
  }

  const request = buildRunwayVideoCreate({
    prompt,
    aspectRatio: options?.aspectRatio,
    duration: options?.duration,
    imageUrl: options?.imageUrl,
  });
  assertActiveRunwayModel(request.body.model);

  const createRes = await runwayFetch(
    request.endpoint,
    {
      method: 'POST',
      headers: runwayHeaders(apiKey),
      body: JSON.stringify(request.body),
    },
    RUNWAY_HTTP_TIMEOUT_MS
  );

  if (!createRes.ok) {
    throwProviderFailed();
  }

  let created: { id?: string };
  try {
    created = (await createRes.json()) as { id?: string };
  } catch {
    throwProviderFailed();
  }
  const taskId = typeof created.id === 'string' ? created.id.trim() : '';
  if (!taskId) {
    throwProviderFailed();
  }

  const pollInterval = runwayPollIntervalForTests ?? RUNWAY_POLL_INTERVAL_MS;
  const maxPolls = runwayMaxPollsForTests ?? RUNWAY_MAX_POLLS;
  let attempts = 0;
  while (attempts < maxPolls) {
    await new Promise((r) => setTimeout(r, pollInterval));
    const pollRes = await runwayFetch(
      `${RUNWAY_TASKS_PATH}${taskId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'X-Runway-Version': RUNWAY_API_VERSION,
        },
      },
      RUNWAY_POLL_HTTP_TIMEOUT_MS
    );

    if (!pollRes.ok) {
      throwProviderFailed();
    }

    let result: { status?: string; output?: unknown };
    try {
      result = (await pollRes.json()) as { status?: string; output?: unknown };
    } catch {
      throwProviderFailed();
    }

    const status = result.status;
    if (status === 'SUCCEEDED') {
      const output = Array.isArray(result.output) ? result.output[0] : result.output;
      const videoUrl = assertRunwayOutputUrl(output);
      return {
        videoUrl,
        provider: `runway-${RUNWAY_VIDEO_MODEL}`,
        imageToVideo: request.mode === 'image_to_video',
      };
    }

    if (status === 'FAILED' || status === 'CANCELLED') {
      throwProviderFailed();
    }

    if (status === 'PENDING' || status === 'THROTTLED' || status === 'RUNNING' || !status) {
      attempts++;
      continue;
    }

    throwProviderFailed();
  }

  throwProviderTimeout();
}
