import { getOpenAiApiKey } from '../config/env.js';
import { ServiceError } from './errors.js';
import { isPaidProviderTestBlocked, IMAGE_PROVIDER_FAILED_MESSAGE } from './media-providers.js';
import { MAX_PROVIDER_IMAGE_BYTES } from './upload-validation.js';

/**
 * Official GPT Image primary for NEXTER studio images.
 * Source: OpenAI Image API Create Image + GPT-Image-2.5 Flare model page.
 * Endpoint remains POST /v1/images/generations. No DALL·E fallback.
 */
export const OPENAI_GPT_IMAGE_MODEL = 'gpt-image-2.5-flare';
export const OPENAI_GPT_IMAGE_ENDPOINT = 'https://api.openai.com/v1/images/generations';
/** Official guide: complex GPT Image prompts may take up to 2 minutes. Bounded + 10s slack. */
export const OPENAI_GPT_IMAGE_TIMEOUT_MS = 130_000;
export const OPENAI_GPT_IMAGE_OUTPUT_FORMAT = 'png' as const;
export const OPENAI_GPT_IMAGE_N = 1;

export type GptImageQuality = 'medium' | 'high';
export type GptImageSize = '1024x1024' | '1536x1024' | '1024x1536';
export type GptImageBackground = 'transparent' | 'opaque';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_B64_CHARS = Math.ceil((MAX_PROVIDER_IMAGE_BYTES * 4) / 3) + 8;
const TRANSPARENT_CAPABLE_MODULES = new Set(['logo', 'facecam', 'overlay', 'sticker', 'profile-pic']);

type ImageFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

let openaiImageTestFetch: ImageFetch | null = null;

export function setOpenAiImageFetchForTests(fn: ImageFetch | null): void {
  openaiImageTestFetch = fn;
}

/** standard creator → medium; premium/hd → high. Never emits DALL·E standard/hd. */
export function mapGptImageQuality(input?: boolean | string): GptImageQuality {
  if (input === true || input === 'hd' || input === 'high' || input === 'premium') return 'high';
  return 'medium';
}

/** Product sizes map onto documented GPT Image recommended sizes only. */
export function mapGptImageSize(size?: string): GptImageSize {
  const raw = typeof size === 'string' ? size.trim().toLowerCase() : '';
  if (raw === '1024x1024') return '1024x1024';
  if (raw === '1536x1024' || raw === '1792x1024') return '1536x1024';
  if (raw === '1024x1536' || raw === '1024x1792') return '1024x1536';
  const match = /^(\d+)x(\d+)$/.exec(raw);
  if (match) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      if (width > height * 1.15) return '1536x1024';
      if (height > width * 1.15) return '1024x1536';
    }
  }
  return '1024x1024';
}

export function mapGptImageBackground(module: string, transparent?: boolean): GptImageBackground {
  if (transparent === true && TRANSPARENT_CAPABLE_MODULES.has(module)) return 'transparent';
  return 'opaque';
}

export function buildGptImageRequest(input: {
  prompt: string;
  size?: string;
  hd?: boolean | string;
  module: string;
  transparentBackground?: boolean;
}): {
  model: string;
  prompt: string;
  n: number;
  size: GptImageSize;
  quality: GptImageQuality;
  output_format: 'png';
  background: GptImageBackground;
} {
  return {
    model: OPENAI_GPT_IMAGE_MODEL,
    prompt: input.prompt,
    n: OPENAI_GPT_IMAGE_N,
    size: mapGptImageSize(input.size),
    quality: mapGptImageQuality(input.hd),
    output_format: OPENAI_GPT_IMAGE_OUTPUT_FORMAT,
    background: mapGptImageBackground(input.module, input.transparentBackground),
  };
}

function throwImageFailed(): never {
  throw new ServiceError(502, 'PROVIDER_ERROR', IMAGE_PROVIDER_FAILED_MESSAGE);
}

function throwImageInvalid(): never {
  throw new ServiceError(502, 'PROVIDER_INVALID_PAYLOAD', IMAGE_PROVIDER_FAILED_MESSAGE);
}

export function decodeGptImagePngBase64(raw: unknown): Buffer {
  if (typeof raw !== 'string') throwImageInvalid();
  const b64 = raw.replace(/\s/g, '');
  if (!b64 || b64.length > MAX_B64_CHARS || !BASE64_RE.test(b64)) throwImageInvalid();
  let buffer: Buffer;
  try {
    buffer = Buffer.from(b64, 'base64');
  } catch {
    throwImageInvalid();
  }
  if (!buffer.length || buffer.length > MAX_PROVIDER_IMAGE_BYTES) throwImageInvalid();
  if (buffer.length < PNG_MAGIC.length || !buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throwImageInvalid();
  }
  return buffer;
}

export async function generateGptImage(input: {
  prompt: string;
  size?: string;
  hd?: boolean | string;
  module: string;
  transparentBackground?: boolean;
}): Promise<{ buffer: Buffer; mimeType: 'image/png'; provider: 'openai'; model: string }> {
  if (isPaidProviderTestBlocked() && !openaiImageTestFetch) {
    throw new ServiceError(503, 'AI_NOT_CONFIGURED', 'GPT-Image ist provider-gated und in Tests blockiert');
  }
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new ServiceError(503, 'AI_NOT_CONFIGURED', 'Die Bildgenerierung ist momentan nicht verfügbar. Es wurden keine Coins abgebucht.');
  }

  const body = buildGptImageRequest(input);
  const fetchFn = openaiImageTestFetch ?? fetch;
  let res: Response;
  try {
    res = await fetchFn(OPENAI_GPT_IMAGE_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(OPENAI_GPT_IMAGE_TIMEOUT_MS),
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

  let payload: { data?: Array<{ b64_json?: unknown; url?: unknown }> };
  try {
    payload = (await res.json()) as { data?: Array<{ b64_json?: unknown; url?: unknown }> };
  } catch {
    throwImageInvalid();
  }

  const first = Array.isArray(payload?.data) ? payload.data[0] : undefined;
  if (!first) throwImageInvalid();
  const buffer = decodeGptImagePngBase64(first.b64_json);
  return {
    buffer,
    mimeType: 'image/png',
    provider: 'openai',
    model: OPENAI_GPT_IMAGE_MODEL,
  };
}
