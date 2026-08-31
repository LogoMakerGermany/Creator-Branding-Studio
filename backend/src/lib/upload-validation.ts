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
  'application/json',
  'application/zip',
]);

const DATA_URL_PATTERN = /^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/;

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

export function parseAndValidateVideoDataUrl(dataUrl: string): {
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

  if (!VIDEO_MIME_TYPES.has(mimeType)) {
    throw new ServiceError(400, 'INVALID_UPLOAD', 'Nur MP4, WebM oder MOV erlaubt');
  }

  const size = Math.max(1, Math.floor((base64.length * 3) / 4));
  if (size > MAX_VIDEO_UPLOAD_BYTES) {
    throw new ServiceError(
      413,
      'FILE_TOO_LARGE',
      `Maximale Videogröße: ${MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024)} MB`
    );
  }

  return { mimeType, size };
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
