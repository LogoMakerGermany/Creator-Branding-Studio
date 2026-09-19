import { isIP } from 'node:net';
import { ServiceError } from './errors.js';
import {
  MAX_PROVIDER_VIDEO_BYTES,
  PROVIDER_VIDEO_FETCH_TIMEOUT_MS,
  PROVIDER_VIDEO_MAX_REDIRECTS,
  PROVIDER_VIDEO_MIME,
  VIDEO_DOWNLOAD_TIMEOUT_CODE,
  VIDEO_DOWNLOAD_TIMEOUT_MESSAGE,
  VIDEO_INVALID_PAYLOAD_CODE,
  VIDEO_INVALID_PAYLOAD_MESSAGE,
  assertProviderVideoBytes,
} from './upload-validation.js';

export const MAX_PROVIDER_AUDIO_BYTES = 20 * 1024 * 1024;
export const PROVIDER_AUDIO_FETCH_TIMEOUT_MS = 30_000;
export const PROVIDER_AUDIO_MAX_REDIRECTS = 3;

export const MUSIC_INVALID_AUDIO_CODE = 'MUSIC_INVALID_AUDIO';
export const MUSIC_DOWNLOAD_TIMEOUT_CODE = 'MUSIC_DOWNLOAD_TIMEOUT';
export const MUSIC_PROVIDER_FAILED_CODE = 'MUSIC_PROVIDER_FAILED';
export const MUSIC_STORAGE_ERROR_CODE = 'MUSIC_STORAGE_ERROR';

export const MUSIC_INVALID_AUDIO_MESSAGE =
  'Die Musikgenerierung lieferte keine gültige Audiodatei. Coins wurden erstattet.';
export const MUSIC_DOWNLOAD_TIMEOUT_MESSAGE =
  'Der Audio-Download hat zu lange gedauert. Coins wurden erstattet.';
export const MUSIC_PROVIDER_FAILED_MESSAGE =
  'Die Musikgenerierung ist fehlgeschlagen. Coins wurden erstattet.';
export const MUSIC_STORAGE_FAILED_MESSAGE =
  'Die Musikdatei konnte nicht gespeichert werden. Coins wurden erstattet.';

const AUDIO_MIME_TO_EXT: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/flac': 'flac',
  'audio/aac': 'm4a',
  'audio/mp4': 'm4a',
};

const ALLOWED_AUDIO_MIME = new Set(Object.keys(AUDIO_MIME_TO_EXT));

const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.goog',
  'metadata.azure.com',
  'kubernetes.default',
  'kubernetes.default.svc',
]);

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

let testFetch: FetchLike | undefined;
let testTimeoutMs: number | undefined;

export function setProviderAudioFetchTestHooks(
  hooks: { fetch?: FetchLike; timeoutMs?: number } | null
): void {
  testFetch = hooks?.fetch;
  testTimeoutMs = hooks?.timeoutMs;
}

export interface ProviderAudio {
  buffer: Buffer;
  mimeType: string;
  extension: string;
}

export function audioExtensionForMime(mimeType: string): string {
  return AUDIO_MIME_TO_EXT[mimeType] ?? 'bin';
}

export function assertSafeProviderAudioUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new ServiceError(502, MUSIC_INVALID_AUDIO_CODE, MUSIC_INVALID_AUDIO_MESSAGE);
  }
  if (/^data:/i.test(trimmed)) {
    throw new ServiceError(502, MUSIC_INVALID_AUDIO_CODE, MUSIC_INVALID_AUDIO_MESSAGE);
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ServiceError(502, MUSIC_INVALID_AUDIO_CODE, MUSIC_INVALID_AUDIO_MESSAGE);
  }
  if (parsed.protocol !== 'https:') {
    throw new ServiceError(502, MUSIC_INVALID_AUDIO_CODE, MUSIC_INVALID_AUDIO_MESSAGE);
  }
  if (parsed.username || parsed.password) {
    throw new ServiceError(502, MUSIC_INVALID_AUDIO_CODE, MUSIC_INVALID_AUDIO_MESSAGE);
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) {
    throw new ServiceError(502, MUSIC_INVALID_AUDIO_CODE, MUSIC_INVALID_AUDIO_MESSAGE);
  }
  if (isBlockedIp(host)) {
    throw new ServiceError(502, MUSIC_INVALID_AUDIO_CODE, MUSIC_INVALID_AUDIO_MESSAGE);
  }
  return parsed;
}

export function isBlockedProviderHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) {
    return true;
  }
  return isBlockedIp(host);
}

function isBlockedIp(host: string): boolean {
  const version = isIP(host);
  if (!version) return false;
  if (version === 4) return isBlockedIpv4(host);
  return isBlockedIpv6(host);
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 168 && b === 63) return true;
  if (a >= 224) return true;
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe80')) return true;
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    if (isIP(mapped) === 4) return isBlockedIpv4(mapped);
  }
  return false;
}

export function parseAudioDataUrl(dataUrl: string): ProviderAudio {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!match) {
    throw new ServiceError(502, MUSIC_INVALID_AUDIO_CODE, MUSIC_INVALID_AUDIO_MESSAGE);
  }
  const mimeType = normalizeAudioMime(match[1]);
  if (!mimeType) {
    throw new ServiceError(502, MUSIC_INVALID_AUDIO_CODE, MUSIC_INVALID_AUDIO_MESSAGE);
  }
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  assertAudioBuffer(buffer, mimeType);
  return { buffer, mimeType, extension: audioExtensionForMime(mimeType) };
}

export async function fetchProviderAudio(url: string): Promise<ProviderAudio> {
  if (url.trim().toLowerCase().startsWith('data:')) {
    return parseAudioDataUrl(url);
  }

  let current = assertSafeProviderAudioUrl(url).href;
  const fetchImpl = testFetch ?? fetch;
  if (process.env.NODE_TEST && !testFetch) {
    throw new ServiceError(502, MUSIC_PROVIDER_FAILED_CODE, MUSIC_PROVIDER_FAILED_MESSAGE);
  }

  for (let hop = 0; hop <= PROVIDER_AUDIO_MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetchImpl(current, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(testTimeoutMs ?? PROVIDER_AUDIO_FETCH_TIMEOUT_MS),
        headers: { Accept: 'audio/*,application/octet-stream' },
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new ServiceError(504, MUSIC_DOWNLOAD_TIMEOUT_CODE, MUSIC_DOWNLOAD_TIMEOUT_MESSAGE);
      }
      throw new ServiceError(502, MUSIC_PROVIDER_FAILED_CODE, MUSIC_PROVIDER_FAILED_MESSAGE);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) {
        throw new ServiceError(502, MUSIC_INVALID_AUDIO_CODE, MUSIC_INVALID_AUDIO_MESSAGE);
      }
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new ServiceError(502, MUSIC_INVALID_AUDIO_CODE, MUSIC_INVALID_AUDIO_MESSAGE);
      }
      current = assertSafeProviderAudioUrl(next.href).href;
      continue;
    }

    if (!res.ok) {
      throw new ServiceError(502, MUSIC_PROVIDER_FAILED_CODE, MUSIC_PROVIDER_FAILED_MESSAGE);
    }

    const contentType = res.headers.get('content-type');
    const buffer = Buffer.from(
      await readResponseBytes(res, MAX_PROVIDER_AUDIO_BYTES, () => {
        throw new ServiceError(413, MUSIC_INVALID_AUDIO_CODE, MUSIC_INVALID_AUDIO_MESSAGE);
      })
    );
    const mimeType = resolveAudioMime(contentType, current, buffer);
    assertAudioBuffer(buffer, mimeType);
    return { buffer, mimeType, extension: audioExtensionForMime(mimeType) };
  }

  throw new ServiceError(502, MUSIC_INVALID_AUDIO_CODE, MUSIC_INVALID_AUDIO_MESSAGE);
}

async function readResponseBytes(
  res: Response,
  maxBytes: number,
  tooLarge: () => never
): Promise<Uint8Array> {
  if (!res.body) {
    const abs = await res.arrayBuffer();
    if (abs.byteLength > maxBytes) tooLarge();
    return new Uint8Array(abs);
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      tooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

function normalizeAudioMime(raw: string | null | undefined): string | null {
  const mime = (raw ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (!mime) return null;
  if (ALLOWED_AUDIO_MIME.has(mime)) {
    if (mime === 'audio/x-wav' || mime === 'audio/wave') return 'audio/wav';
    if (mime === 'audio/mp3') return 'audio/mpeg';
    return mime;
  }
  return null;
}

function resolveAudioMime(contentType: string | null, url: string, buffer: Buffer): string {
  const fromHeader = normalizeAudioMime(contentType);
  if (fromHeader) return fromHeader;
  const sniffed = sniffAudioMime(buffer);
  if (sniffed) return sniffed;
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return '';
    }
  })();
  if (path.endsWith('.wav')) return 'audio/wav';
  if (path.endsWith('.mp3')) return 'audio/mpeg';
  if (path.endsWith('.ogg')) return 'audio/ogg';
  if (path.endsWith('.flac')) return 'audio/flac';
  if (contentType && !/octet-stream|binary/i.test(contentType)) {
    throw new ServiceError(502, MUSIC_INVALID_AUDIO_CODE, MUSIC_INVALID_AUDIO_MESSAGE);
  }
  throw new ServiceError(502, MUSIC_INVALID_AUDIO_CODE, MUSIC_INVALID_AUDIO_MESSAGE);
}

function sniffAudioMime(buffer: Buffer): string | null {
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE') {
    return 'audio/wav';
  }
  if (buffer.length >= 3 && buffer.toString('ascii', 0, 3) === 'ID3') return 'audio/mpeg';
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'OggS') return 'audio/ogg';
  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'fLaC') return 'audio/flac';
  return null;
}

function assertAudioBuffer(buffer: Buffer, mimeType: string): void {
  if (!buffer.length) {
    throw new ServiceError(502, MUSIC_INVALID_AUDIO_CODE, MUSIC_INVALID_AUDIO_MESSAGE);
  }
  if (buffer.length > MAX_PROVIDER_AUDIO_BYTES) {
    throw new ServiceError(413, MUSIC_INVALID_AUDIO_CODE, MUSIC_INVALID_AUDIO_MESSAGE);
  }
  if (!ALLOWED_AUDIO_MIME.has(mimeType) && mimeType !== 'audio/wav' && mimeType !== 'audio/mpeg') {
    throw new ServiceError(502, MUSIC_INVALID_AUDIO_CODE, MUSIC_INVALID_AUDIO_MESSAGE);
  }
}

let testVideoFetch: FetchLike | undefined;
let testVideoTimeoutMs: number | undefined;

export function setProviderVideoFetchTestHooks(
  hooks: { fetch?: FetchLike; timeoutMs?: number } | null
): void {
  testVideoFetch = hooks?.fetch;
  testVideoTimeoutMs = hooks?.timeoutMs;
}

export interface ProviderVideo {
  buffer: Buffer;
  mimeType: typeof PROVIDER_VIDEO_MIME;
}

export function assertSafeProviderVideoUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed || /^data:/i.test(trimmed)) {
    throw new ServiceError(502, VIDEO_INVALID_PAYLOAD_CODE, VIDEO_INVALID_PAYLOAD_MESSAGE);
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ServiceError(502, VIDEO_INVALID_PAYLOAD_CODE, VIDEO_INVALID_PAYLOAD_MESSAGE);
  }
  if (parsed.protocol !== 'https:') {
    throw new ServiceError(502, VIDEO_INVALID_PAYLOAD_CODE, VIDEO_INVALID_PAYLOAD_MESSAGE);
  }
  if (parsed.username || parsed.password) {
    throw new ServiceError(502, VIDEO_INVALID_PAYLOAD_CODE, VIDEO_INVALID_PAYLOAD_MESSAGE);
  }
  if (isBlockedProviderHost(parsed.hostname)) {
    throw new ServiceError(502, VIDEO_INVALID_PAYLOAD_CODE, VIDEO_INVALID_PAYLOAD_MESSAGE);
  }
  return parsed;
}

export async function fetchProviderVideo(url: string): Promise<ProviderVideo> {
  let current = assertSafeProviderVideoUrl(url).href;
  const fetchImpl = testVideoFetch ?? fetch;
  if (process.env.NODE_TEST && !testVideoFetch) {
    throw new ServiceError(502, VIDEO_INVALID_PAYLOAD_CODE, VIDEO_INVALID_PAYLOAD_MESSAGE);
  }

  for (let hop = 0; hop <= PROVIDER_VIDEO_MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetchImpl(current, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(testVideoTimeoutMs ?? PROVIDER_VIDEO_FETCH_TIMEOUT_MS),
        headers: { Accept: 'video/mp4,video/*,application/octet-stream' },
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new ServiceError(504, VIDEO_DOWNLOAD_TIMEOUT_CODE, VIDEO_DOWNLOAD_TIMEOUT_MESSAGE);
      }
      throw new ServiceError(502, VIDEO_INVALID_PAYLOAD_CODE, VIDEO_INVALID_PAYLOAD_MESSAGE);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) {
        throw new ServiceError(502, VIDEO_INVALID_PAYLOAD_CODE, VIDEO_INVALID_PAYLOAD_MESSAGE);
      }
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new ServiceError(502, VIDEO_INVALID_PAYLOAD_CODE, VIDEO_INVALID_PAYLOAD_MESSAGE);
      }
      current = assertSafeProviderVideoUrl(next.href).href;
      continue;
    }

    if (!res.ok) {
      throw new ServiceError(502, VIDEO_INVALID_PAYLOAD_CODE, VIDEO_INVALID_PAYLOAD_MESSAGE);
    }

    const contentType = res.headers.get('content-type');
    const buffer = Buffer.from(
      await readResponseBytes(res, MAX_PROVIDER_VIDEO_BYTES, () => {
        throw new ServiceError(413, VIDEO_INVALID_PAYLOAD_CODE, VIDEO_INVALID_PAYLOAD_MESSAGE);
      })
    );
    assertProviderVideoBytes(buffer, contentType);
    return { buffer, mimeType: PROVIDER_VIDEO_MIME };
  }

  throw new ServiceError(502, VIDEO_INVALID_PAYLOAD_CODE, VIDEO_INVALID_PAYLOAD_MESSAGE);
}
