import { randomUUID } from 'node:crypto';
import { getStorage } from '../config/firebase.js';
import { isDevMode } from '../config/env.js';

const SIGNED_URL_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function uploadAssetFromUrl(
  userId: string,
  sourceUrl: string,
  options: { folder?: string; fileName?: string; contentType?: string }
): Promise<string> {
  if (sourceUrl.startsWith('data:')) {
    return uploadAssetFromDataUrl(userId, sourceUrl, options);
  }

  if (isDevMode()) {
    return sourceUrl;
  }

  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new Error(`Asset download failed: ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType =
    options.contentType || res.headers.get('content-type') || 'application/octet-stream';

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

  return getSignedDownloadUrl(path);
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
  if (url.startsWith('users/')) return url.split('?')[0]!;
  const match = url.match(/\/o\/([^?]+)/);
  if (match?.[1]) return decodeURIComponent(match[1]);
  const gcs = url.match(/storage\.googleapis\.com\/[^/]+\/(.+?)(?:\?|$)/);
  if (gcs?.[1]) return decodeURIComponent(gcs[1]);
  return null;
}

export async function deleteStorageObject(storagePath: string): Promise<void> {
  if (isDevMode()) return;
  const storage = getStorage();
  await storage.bucket().file(storagePath).delete({ ignoreNotFound: true });
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
