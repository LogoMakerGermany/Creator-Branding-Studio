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

export function isSafeAssetUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('https://') || url.startsWith('http://')) return true;
  if (url.startsWith('data:image/png') || url.startsWith('data:image/jpeg') || url.startsWith('data:image/webp')) {
    return true;
  }
  if (url.startsWith('data:image/svg+xml')) return true;
  return false;
}
