import { ServiceError } from './errors.js';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_PROJECT_ZIP_BYTES = 80 * 1024 * 1024;
export const MAX_FILES_PER_USER = 100;

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
  'video/mp4',
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'application/json',
  'application/zip',
]);

const DATA_URL_PATTERN = /^data:([^;]+);base64,([A-Za-z0-9+/=\s]*)$/;

export function parseAndValidateDataUrl(dataUrl: string): {
  mimeType: string;
  size: number;
} {
  const trimmed = dataUrl.trim();
  const match = DATA_URL_PATTERN.exec(trimmed);
  if (!match) {
    throw new ServiceError(400, 'INVALID_UPLOAD', 'Ungültiges Dateiformat (data URL erwartet)');
  }

  const mimeType = match[1].toLowerCase();
  const base64 = match[2].replace(/\s/g, '');
  if (!base64) {
    throw new ServiceError(400, 'EMPTY_UPLOAD', 'Leere Datei ist nicht erlaubt');
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new ServiceError(400, 'INVALID_UPLOAD', 'Dateityp nicht erlaubt');
  }

  const size = Math.max(1, Math.floor((base64.length * 3) / 4));
  if (size > MAX_UPLOAD_BYTES) {
    throw new ServiceError(413, 'FILE_TOO_LARGE', `Maximale Dateigröße: ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`);
  }

  return { mimeType, size };
}

const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
export const MIN_VIDEO_BYTES = 32;
export const MAX_VIDEO_DURATION_SEC = 7200;
export const MAX_VIDEO_OUTPUT_BYTES = 80 * 1024 * 1024;
export const FFMPEG_TIMEOUT_MS = 120_000;
export const MAX_CONCURRENT_LOCAL_VIDEO_JOBS = 2;

const VIDEO_EXT_BY_MIME: Record<string, string[]> = {
  'video/mp4': ['mp4', 'm4v'],
  'video/webm': ['webm'],
  'video/quicktime': ['mov', 'qt'],
};

export function sniffVideoContainer(buffer: Buffer): 'video/mp4' | 'video/webm' | 'video/quicktime' | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return 'video/webm';
  }
  const brand = buffer.subarray(4, 8).toString('ascii');
  if (brand === 'ftyp') {
    const major = buffer.subarray(8, 12).toString('ascii');
    if (major === 'qt  ') return 'video/quicktime';
    return 'video/mp4';
  }
  return null;
}

/** Bounded ISO-BMFF check: size + `ftyp` only. Not a media parser. */
export function hasSafeMp4Ftyp(buffer: Buffer): boolean {
  if (buffer.length < 16) return false;
  const boxSize = buffer.readUInt32BE(0);
  if (boxSize < 16 || boxSize > 256 || boxSize > buffer.length) return false;
  return buffer.toString('ascii', 4, 8) === 'ftyp';
}

export function videoExtensionAllowed(fileName: string | undefined, mimeType: string): boolean {
  if (!fileName) return true;
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const allowed = VIDEO_EXT_BY_MIME[mimeType];
  if (!allowed) return false;
  return allowed.includes(ext);
}

export function looksLikePathInjection(value: string): boolean {
  return /[\\/]|(\.\.)|[:;|&`$]|[\n\r]/.test(value);
}

export const MAX_FEEDBACK_SCREENSHOT_CHARS = 2_000_000;
export const FEEDBACK_SCREENSHOT_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

export function sniffRasterImageMime(buffer: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export function parseAndValidateFeedbackScreenshot(dataUrl: string): {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  size: number;
  buffer: Buffer;
} {
  const trimmed = dataUrl.trim();
  const match = DATA_URL_PATTERN.exec(trimmed);
  if (!match) {
    throw new ServiceError(400, 'VALIDATION_ERROR', 'Screenshot muss ein Bild (PNG/JPEG/WebP) als Data-URL sein');
  }
  const declared = match[1].toLowerCase();
  if (declared === 'image/svg+xml' || !FEEDBACK_SCREENSHOT_MIME.has(declared)) {
    throw new ServiceError(400, 'VALIDATION_ERROR', 'Screenshot muss ein Bild (PNG/JPEG/WebP) als Data-URL sein');
  }
  const base64 = match[2].replace(/\s/g, '');
  if (!base64) {
    throw new ServiceError(400, 'VALIDATION_ERROR', 'Screenshot ist leer');
  }
  if (trimmed.length > MAX_FEEDBACK_SCREENSHOT_CHARS) {
    throw new ServiceError(400, 'VALIDATION_ERROR', 'Screenshot ist zu groß');
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    throw new ServiceError(400, 'VALIDATION_ERROR', 'Ungültiger Screenshot');
  }
  if (!buffer.length) {
    throw new ServiceError(400, 'VALIDATION_ERROR', 'Screenshot ist leer');
  }
  const sniffed = sniffRasterImageMime(buffer);
  if (!sniffed) {
    throw new ServiceError(400, 'VALIDATION_ERROR', 'Screenshot-Inhalt ist kein gültiges Bild');
  }
  const normalizedDeclared = declared === 'image/jpg' ? 'image/jpeg' : declared;
  if (normalizedDeclared !== sniffed) {
    throw new ServiceError(400, 'VALIDATION_ERROR', 'Screenshot-Inhalt ist kein gültiges Bild');
  }
  return { mimeType: sniffed, size: buffer.length, buffer };
}

export function parseAndValidateVideoDataUrl(
  dataUrl: string,
  options?: { fileName?: string }
): {
  mimeType: string;
  size: number;
  buffer: Buffer;
} {
  const trimmed = dataUrl.trim();
  const match = DATA_URL_PATTERN.exec(trimmed);
  if (!match) {
    throw new ServiceError(400, 'INVALID_UPLOAD', 'Ungültiges Dateiformat (data URL erwartet)');
  }

  const declared = match[1].toLowerCase();
  const base64 = match[2].replace(/\s/g, '');

  if (!VIDEO_MIME_TYPES.has(declared)) {
    throw new ServiceError(400, 'INVALID_UPLOAD', 'Nur MP4, WebM oder MOV erlaubt');
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    throw new ServiceError(400, 'INVALID_UPLOAD', 'Ungültige Videodatei');
  }

  if (buffer.length < MIN_VIDEO_BYTES) {
    throw new ServiceError(400, 'INVALID_UPLOAD', 'Datei ist leer oder ungültig');
  }

  if (buffer.length > MAX_VIDEO_UPLOAD_BYTES) {
    throw new ServiceError(
      413,
      'FILE_TOO_LARGE',
      `Maximale Videogröße: ${MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024)} MB`
    );
  }

  const sniffed = sniffVideoContainer(buffer);
  if (!sniffed) {
    throw new ServiceError(400, 'INVALID_UPLOAD', 'Dateityp stimmt nicht mit dem Inhalt überein');
  }
  if (declared === 'video/webm' && sniffed !== 'video/webm') {
    throw new ServiceError(400, 'INVALID_UPLOAD', 'Dateityp stimmt nicht mit dem Inhalt überein');
  }
  if (declared !== 'video/webm' && sniffed === 'video/webm') {
    throw new ServiceError(400, 'INVALID_UPLOAD', 'Dateityp stimmt nicht mit dem Inhalt überein');
  }
  if (options?.fileName && !videoExtensionAllowed(options.fileName, sniffed)) {
    throw new ServiceError(400, 'INVALID_UPLOAD', 'Dateiendung nicht erlaubt');
  }

  return { mimeType: sniffed, size: buffer.length, buffer };
}

export function parseAndValidateProjectZipDataUrl(dataUrl: string): {
  mimeType: string;
  size: number;
  buffer: Buffer;
} {
  const trimmed = dataUrl.trim();
  const match = DATA_URL_PATTERN.exec(trimmed);
  if (!match) {
    throw new ServiceError(400, 'INVALID_UPLOAD', 'Ungültiges ZIP-Format (data URL erwartet)');
  }

  const mimeType = match[1].toLowerCase();
  const base64 = match[2].replace(/\s/g, '');

  if (mimeType !== 'application/zip' && mimeType !== 'application/x-zip-compressed') {
    throw new ServiceError(400, 'INVALID_UPLOAD', 'Nur ZIP-Dateien sind für den Projekt-Import erlaubt');
  }

  const size = Math.max(1, Math.floor((base64.length * 3) / 4));
  if (size > MAX_PROJECT_ZIP_BYTES) {
    throw new ServiceError(
      413,
      'FILE_TOO_LARGE',
      `Maximale ZIP-Größe: ${MAX_PROJECT_ZIP_BYTES / (1024 * 1024)} MB`
    );
  }

  return {
    mimeType: 'application/zip',
    size,
    buffer: Buffer.from(base64, 'base64'),
  };
}

export const MAX_PROVIDER_IMAGE_BYTES = 15 * 1024 * 1024;
export const PROVIDER_IMAGE_FETCH_TIMEOUT_MS = 20_000;

/**
 * Bounded provider-video download. Matches MAX_VIDEO_UPLOAD_BYTES (50 MB).
 * Runway gen4.5 clips are 2–10s at 1280:720 / 720:1280 — typically well under 15 MB.
 * 50 MB is headroom without unbounded buffering.
 */
export const MAX_PROVIDER_VIDEO_BYTES = MAX_VIDEO_UPLOAD_BYTES;
export const PROVIDER_VIDEO_FETCH_TIMEOUT_MS = 45_000;
export const PROVIDER_VIDEO_MAX_REDIRECTS = 3;
export const PROVIDER_VIDEO_MIME = 'video/mp4';

export const VIDEO_INVALID_PAYLOAD_CODE = 'VIDEO_INVALID_PAYLOAD';
export const VIDEO_DOWNLOAD_TIMEOUT_CODE = 'VIDEO_DOWNLOAD_TIMEOUT';
export const VIDEO_STORAGE_ERROR_CODE = 'VIDEO_STORAGE_ERROR';
export const VIDEO_INVALID_PAYLOAD_MESSAGE =
  'Das KI-Video konnte nicht verarbeitet werden. Coins wurden erstattet.';
export const VIDEO_DOWNLOAD_TIMEOUT_MESSAGE =
  'Das KI-Video konnte nicht geladen werden. Coins wurden erstattet.';
export const VIDEO_STORAGE_ERROR_MESSAGE =
  'Das KI-Video konnte nicht gespeichert werden. Coins wurden erstattet.';

const PROVIDER_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']);

export function isSafeAssetUrl(url: string): boolean {
  if (!url) return false;
  if (
    url.startsWith('data:image/png') ||
    url.startsWith('data:image/jpeg') ||
    url.startsWith('data:image/webp') ||
    url.startsWith('data:image/svg+xml')
  ) {
    return true;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function assertSafeProviderImageUrl(url: string): string {
  if (!isSafeAssetUrl(url)) {
    throw new ServiceError(
      502,
      'PROVIDER_INVALID_PAYLOAD',
      'Die Bildgenerierung lieferte kein gültiges Bild. Coins wurden erstattet.'
    );
  }
  return url;
}

export function assertProviderImageBytes(buffer: Buffer, contentType?: string | null): void {
  if (!buffer.length) {
    throw new ServiceError(
      502,
      'PROVIDER_INVALID_PAYLOAD',
      'Die Bildgenerierung lieferte eine leere Datei. Coins wurden erstattet.'
    );
  }
  if (buffer.length > MAX_PROVIDER_IMAGE_BYTES) {
    throw new ServiceError(
      502,
      'PROVIDER_INVALID_PAYLOAD',
      'Die Bilddatei ist zu groß. Coins wurden erstattet.'
    );
  }
  const mime = (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (mime && mime !== 'application/octet-stream' && !PROVIDER_IMAGE_MIME.has(mime) && !mime.startsWith('image/')) {
    throw new ServiceError(
      502,
      'PROVIDER_INVALID_PAYLOAD',
      'Die Bildgenerierung lieferte keinen Bildinhalt. Coins wurden erstattet.'
    );
  }
}

export function assertProviderVideoBytes(buffer: Buffer, contentType?: string | null): void {
  if (!buffer.length) {
    throw new ServiceError(502, VIDEO_INVALID_PAYLOAD_CODE, VIDEO_INVALID_PAYLOAD_MESSAGE);
  }
  if (buffer.length > MAX_PROVIDER_VIDEO_BYTES) {
    throw new ServiceError(413, VIDEO_INVALID_PAYLOAD_CODE, VIDEO_INVALID_PAYLOAD_MESSAGE);
  }
  const mime = (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (
    mime &&
    mime !== 'application/octet-stream' &&
    mime !== PROVIDER_VIDEO_MIME &&
    !mime.startsWith('video/')
  ) {
    throw new ServiceError(502, VIDEO_INVALID_PAYLOAD_CODE, VIDEO_INVALID_PAYLOAD_MESSAGE);
  }
  if (mime.startsWith('video/') && mime !== PROVIDER_VIDEO_MIME) {
    throw new ServiceError(502, VIDEO_INVALID_PAYLOAD_CODE, VIDEO_INVALID_PAYLOAD_MESSAGE);
  }
  if (!hasSafeMp4Ftyp(buffer) || sniffVideoContainer(buffer) !== PROVIDER_VIDEO_MIME) {
    throw new ServiceError(502, VIDEO_INVALID_PAYLOAD_CODE, VIDEO_INVALID_PAYLOAD_MESSAGE);
  }
}
