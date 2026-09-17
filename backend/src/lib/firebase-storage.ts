import { randomUUID } from 'node:crypto';
import { getStorage } from '../config/firebase.js';
import { isDevMode } from '../config/env.js';
import { ServiceError } from './errors.js';
import {
  assertProviderImageBytes,
  assertSafeProviderImageUrl,
  PROVIDER_IMAGE_FETCH_TIMEOUT_MS,
} from './upload-validation.js';
import { IMAGE_PROVIDER_FAILED_MESSAGE } from './media-providers.js';

/** Short-lived signed read URLs. Not an authorization token beyond expiry. */
export const SIGNED_URL_TTL_MS = 60 * 60 * 1000;

export async function uploadAssetFromUrl(
  userId: string,
  sourceUrl: string,
  options: { folder?: string; fileName?: string; contentType?: string }
): Promise<string> {
  assertSafeProviderImageUrl(sourceUrl);
  if (sourceUrl.startsWith('data:')) {
    return uploadAssetFromDataUrl(userId, sourceUrl, options);
  }

  if (isDevMode()) {
    return sourceUrl;
  }

  let res: Response;
  try {
    res = await fetch(sourceUrl, {
      redirect: 'error',
      signal: AbortSignal.timeout(PROVIDER_IMAGE_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new ServiceError(504, 'PROVIDER_TIMEOUT', IMAGE_PROVIDER_FAILED_MESSAGE);
    }
    throw new ServiceError(503, 'STORAGE_ERROR', IMAGE_PROVIDER_FAILED_MESSAGE);
  }
  if (!res.ok) {
    throw new ServiceError(502, 'PROVIDER_ERROR', IMAGE_PROVIDER_FAILED_MESSAGE);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType =
    options.contentType || res.headers.get('content-type') || 'application/octet-stream';
  assertProviderImageBytes(buffer, contentType);

  return uploadBuffer(userId, buffer, {
    ...options,
    contentType,
    extension: extensionFromContentType(contentType),
  });
}

export async function uploadAssetFromDataUrl(
  userId: string,
  dataUrl: string,
  options: { folder?: string; fileName?: string }
): Promise<string> {
  if (isDevMode()) {
    return dataUrl;
  }

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid data URL');
  }

  const contentType = match[1];
  const buffer = Buffer.from(match[2], 'base64');

  return uploadBuffer(userId, buffer, {
    ...options,
    contentType,
    extension: extensionFromContentType(contentType),
  });
}

export async function uploadAssetFromBuffer(
  userId: string,
  buffer: Buffer,
  options: { folder?: string; fileName?: string; contentType: string; extension?: string }
): Promise<string> {
  return uploadBuffer(userId, buffer, options);
}

/**
 * Upload private object and return a short-lived signed URL.
 * Objects are NOT made public — storage.rules remain authoritative.
 */
async function uploadBuffer(
  userId: string,
  buffer: Buffer,
  options: { folder?: string; fileName?: string; contentType: string; extension?: string }
): Promise<string> {
  if (isDevMode()) {
    return `data:${options.contentType};base64,${buffer.toString('base64')}`;
  }

  const storage = getStorage();
  const bucket = storage.bucket();
  const folder = options.folder || 'assets';
  const ext = options.extension || 'bin';
  const fileName = options.fileName || `${randomUUID()}.${ext}`;
  const path = `users/${userId}/${folder}/${fileName}`;
  const file = bucket.file(path);

  await file.save(buffer, {
    metadata: {
      contentType: options.contentType,
      metadata: { ownerId: userId },
    },
    resumable: false,
    public: false,
  });

  return signOwnedStoragePath(userId, path);
}

/** Create a time-limited signed download URL for a storage object path. */
export async function getSignedDownloadUrl(
  storagePath: string,
  ttlMs = SIGNED_URL_TTL_MS
): Promise<string> {
  if (isDevMode()) {
    return storagePath;
  }

  const storage = getStorage();
  const bucket = storage.bucket();
  const file = bucket.file(storagePath);
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + ttlMs,
  });
  return url;
}

/** Parse gs path or users/... path from a prior signed/public URL when possible. */
export function extractStoragePathFromUrl(url: string): string | null {
  if (!url || url.startsWith('data:')) return null;
  if (url.startsWith('users/')) return url.split('?')[0]!;
  const match = url.match(/\/o\/([^?]+)/);
  if (match?.[1]) return decodeURIComponent(match[1]);
  const gcs = url.match(/storage\.googleapis\.com\/[^/]+\/(.+?)(?:\?|$)/);
  if (gcs?.[1]) return decodeURIComponent(gcs[1]);
  return null;
}

/** Only `users/{userId}/...` without `..` is a safe owned object. */
export function isOwnedStoragePath(userId: string, storagePath: string): boolean {
  if (typeof storagePath !== 'string' || typeof userId !== 'string' || !userId) return false;
  if (
    storagePath.startsWith('/') ||
    storagePath.includes('\\') ||
    storagePath.includes('\0') ||
    storagePath.includes('://') ||
    storagePath.includes('..') ||
    /%2e/i.test(storagePath)
  ) {
    return false;
  }
  const prefix = `users/${userId}/`;
  if (!storagePath.startsWith(prefix)) return false;
  const rest = storagePath.slice(prefix.length);
  if (!rest || rest.split('/').some((part) => !part || part === '.' || part === '..')) return false;
  return true;
}

type StorageDeleteTestHooks = {
  deletedPaths: string[];
  failDelete?: boolean;
  missingObject?: boolean;
};

let storageDeleteTestHooks: StorageDeleteTestHooks | null = null;

export function setStorageDeleteTestHooks(hooks: { failDelete?: boolean; missingObject?: boolean } | null): void {
  storageDeleteTestHooks = hooks ? { deletedPaths: [], failDelete: hooks.failDelete, missingObject: hooks.missingObject } : null;
}

export function getStorageDeletedPaths(): string[] {
  return storageDeleteTestHooks?.deletedPaths ? [...storageDeleteTestHooks.deletedPaths] : [];
}

/**
 * Sign a storage path only after ownership is verified.
 * The signer is never invoked for a foreign or malformed path.
 */
export async function signOwnedStoragePath(
  userId: string,
  storagePath: string,
  sign: (path: string, ttlMs?: number) => Promise<string> = getSignedDownloadUrl,
  ttlMs = SIGNED_URL_TTL_MS
): Promise<string> {
  if (!isOwnedStoragePath(userId, storagePath)) {
    throw new ServiceError(403, 'FORBIDDEN', 'Zugriff auf diesen Storage-Pfad ist nicht erlaubt');
  }
  return sign(storagePath, ttlMs);
}

export async function ownedStorageObjectAvailable(userId: string, storagePath: string): Promise<boolean> {
  if (!isOwnedStoragePath(userId, storagePath)) return false;
  if (storageDeleteTestHooks?.missingObject) return false;
  if (isDevMode()) return true;
  const storage = getStorage();
  const [exists] = await storage.bucket().file(storagePath).exists();
  return exists;
}

export async function deleteStorageObject(storagePath: string): Promise<void> {
  if (storageDeleteTestHooks) {
    storageDeleteTestHooks.deletedPaths.push(storagePath);
    if (storageDeleteTestHooks.failDelete) {
      throw new Error('STORAGE_DELETE_FAILED');
    }
  }
  if (isDevMode()) return;
  const storage = getStorage();
  await storage.bucket().file(storagePath).delete({ ignoreNotFound: true });
}

/**
 * Delete exactly one owned object. Never a prefix. Foreign/malformed paths are skipped, not escaped.
 */
export async function deleteOwnedStorageObject(userId: string, storagePath: string): Promise<void> {
  if (!isOwnedStoragePath(userId, storagePath)) {
    throw new ServiceError(403, 'FORBIDDEN', 'Zugriff auf diesen Storage-Pfad ist nicht erlaubt');
  }
  await deleteStorageObject(storagePath);
}

function extensionFromContentType(contentType: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'video/mp4': 'mp4',
    'application/zip': 'zip',
  };
  return map[contentType] || 'bin';
}
