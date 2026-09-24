import { getOpenAiApiKey } from '../config/env.js';
import { ServiceError } from './errors.js';
import { isPaidProviderTestBlocked, IMAGE_PROVIDER_FAILED_MESSAGE } from './media-providers.js';
import { MAX_PROVIDER_IMAGE_BYTES } from './upload-validation.js';
import {
  decodeGptImagePngBase64,
  mapGptImageQuality,
  mapGptImageSize,
  OPENAI_GPT_IMAGE_TIMEOUT_MS,
  type GptImageBackground,
  type GptImageQuality,
  type GptImageSize,
} from './openai-image.js';

/**
 * Official GPT Image edit for NEXTER asset modification.
 * Source: OpenAI Image API Create image edit (POST /v1/images/edits).
 * Model: gpt-image-2.5-sunburst. Distinct from CREATE. Never posts to the generations path.
 */
export const OPENAI_GPT_IMAGE_EDIT_MODEL = 'gpt-image-2.5-sunburst';
export const OPENAI_GPT_IMAGE_EDIT_ENDPOINT = 'https://api.openai.com/v1/images/edits';
export const OPENAI_GPT_IMAGE_EDIT_TIMEOUT_MS = OPENAI_GPT_IMAGE_TIMEOUT_MS;
export const OPENAI_GPT_IMAGE_EDIT_OUTPUT_FORMAT = 'png' as const;
export const OPENAI_GPT_IMAGE_EDIT_N = 1;
export const OPENAI_GPT_IMAGE_EDIT_MODELS = new Set([OPENAI_GPT_IMAGE_EDIT_MODEL]);

type ImageFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

let openaiImageEditTestFetch: ImageFetch | null = null;

export function setOpenAiImageEditFetchForTests(fn: ImageFetch | null): void {
  openaiImageEditTestFetch = fn;
}

export function isOpenAiImageEditTestFetchActive(): boolean {
  return openaiImageEditTestFetch != null;
}

export function assertAllowedImageEditModel(model?: string): string {
  const resolved = typeof model === 'string' && model.trim() ? model.trim() : OPENAI_GPT_IMAGE_EDIT_MODEL;
  if (!OPENAI_GPT_IMAGE_EDIT_MODELS.has(resolved)) {
    throw new ServiceError(400, 'INVALID_MODEL', 'Dieses Bildmodell ist nicht erlaubt.');
  }
  return OPENAI_GPT_IMAGE_EDIT_MODEL;
}

function throwImageFailed(): never {
  throw new ServiceError(502, 'PROVIDER_ERROR', IMAGE_PROVIDER_FAILED_MESSAGE);
}

function throwImageInvalid(): never {
  throw new ServiceError(502, 'PROVIDER_INVALID_PAYLOAD', IMAGE_PROVIDER_FAILED_MESSAGE);
}

function filenameForMime(mime: string): string {
  if (mime === 'image/jpeg') return 'source.jpg';
  if (mime === 'image/webp') return 'source.webp';
  return 'source.png';
}

export async function editGptImage(input: {
  sourceImage: Buffer;
  sourceMimeType: string;
  prompt: string;
  mask?: Buffer;
  size?: string;
  quality?: boolean | string;
  background?: GptImageBackground;
}): Promise<{
  buffer: Buffer;
  mimeType: 'image/png';
  provider: 'openai';
  model: string;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
}> {
  if (isPaidProviderTestBlocked() && !openaiImageEditTestFetch) {
    throw new ServiceError(503, 'AI_NOT_CONFIGURED', 'GPT-Image-Edit ist provider-gated und in Tests blockiert');
  }
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new ServiceError(
      503,
      'AI_NOT_CONFIGURED',
      'Die Bildbearbeitung ist momentan nicht verfügbar. Es wurden keine Coins abgebucht.'
    );
  }
  if (!input.sourceImage?.length || input.sourceImage.length > MAX_PROVIDER_IMAGE_BYTES) {
    throwImageInvalid();
  }
  if (input.mask && (!input.mask.length || input.mask.length > MAX_PROVIDER_IMAGE_BYTES)) {
    throwImageInvalid();
  }

  const model = assertAllowedImageEditModel();
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', input.prompt.slice(0, 32000));
  form.append('n', String(OPENAI_GPT_IMAGE_EDIT_N));
  form.append('size', mapGptImageSize(input.size));
  form.append('quality', mapGptImageQuality(input.quality));
  form.append('output_format', OPENAI_GPT_IMAGE_EDIT_OUTPUT_FORMAT);
  form.append('background', input.background === 'transparent' ? 'transparent' : 'opaque');
  form.append(
    'image[]',
    new Blob([new Uint8Array(input.sourceImage)], { type: input.sourceMimeType || 'image/png' }),
    filenameForMime(input.sourceMimeType)
  );
  if (input.mask) {
    form.append('mask', new Blob([new Uint8Array(input.mask)], { type: 'image/png' }), 'mask.png');
  }

  const fetchFn = openaiImageEditTestFetch ?? fetch;
  let res: Response;
  try {
    res = await fetchFn(OPENAI_GPT_IMAGE_EDIT_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
      signal: AbortSignal.timeout(OPENAI_GPT_IMAGE_EDIT_TIMEOUT_MS),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new ServiceError(504, 'PROVIDER_TIMEOUT', IMAGE_PROVIDER_FAILED_MESSAGE);
    }
    throwImageFailed();
  }

  if (!res.ok) {
    throwImageFailed();
  }

  let payload: {
    data?: Array<{ b64_json?: unknown; url?: unknown }>;
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  };
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    throwImageInvalid();
  }

  const first = Array.isArray(payload?.data) ? payload.data[0] : undefined;
  if (!first || first.b64_json == null) throwImageInvalid();
  const buffer = decodeGptImagePngBase64(first.b64_json);
  const usage =
    payload.usage && typeof payload.usage === 'object'
      ? {
          input_tokens: payload.usage.input_tokens,
          output_tokens: payload.usage.output_tokens,
          total_tokens: payload.usage.total_tokens,
        }
      : undefined;
  return {
    buffer,
    mimeType: 'image/png',
    provider: 'openai',
    model,
    usage,
  };
}

export type { GptImageBackground, GptImageQuality, GptImageSize };
