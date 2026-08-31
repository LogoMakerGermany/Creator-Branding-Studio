import { randomUUID } from 'node:crypto';
import { dsDelete, dsGet, dsList, dsSet } from '../lib/data-store.js';
import { parseAndValidateDataUrl, parseAndValidateVideoDataUrl } from '../lib/upload-validation.js';
import {
  deleteStorageObject,
  extractStoragePathFromUrl,
  isOwnedStoragePath,
  uploadAssetFromDataUrl,
  uploadAssetFromUrl,
} from '../lib/firebase-storage.js';

const FILES_COLLECTION = 'files';

export type FileCategory = 'logo' | 'banner' | 'video' | 'project' | 'overlay' | 'sticker' | 'other';

export interface UserFile {
  id: string;
  userId: string;
  name: string;
  mimeType: string;
  size: number;
  category: FileCategory;
  downloadUrl?: string;
  storagePath?: string;
  source?: 'upload' | 'generation';
  projectId?: string;
  sourceJobId?: string;
  sourceAssetId?: string;
  createdAt: string;
}

export async function listUserFiles(
  userId: string,
  opts?: { projectId?: string }
): Promise<UserFile[]> {
  const files = (await dsList(FILES_COLLECTION, { userId, orderBy: 'createdAt', order: 'desc' })) as unknown as UserFile[];
  if (!opts?.projectId) return files;
  return files.filter((f) => f.projectId === opts.projectId);
}

export async function getUserFile(id: string, userId: string): Promise<UserFile | null> {
  const file = await dsGet(FILES_COLLECTION, id);
  if (!file || file.userId !== userId) return null;
  return file as unknown as UserFile;
}

export async function getUserFileWithData(
  id: string,
  userId: string
): Promise<(UserFile & { dataUrl: string }) | null> {
  const file = await getUserFile(id, userId);
  if (!file) return null;

  if (file.downloadUrl) {
    return { ...file, dataUrl: file.downloadUrl };
  }

  return null;
}

export async function saveUserFile(
  userId: string,
  input: {
    name: string;
    mimeType: string;
    category: FileCategory;
    dataUrl: string;
    source?: 'upload' | 'generation';
    projectId?: string;
    sourceJobId?: string;
    sourceAssetId?: string;
  }
): Promise<UserFile> {
  const trimmed = input.dataUrl.trim();
  let validated: { mimeType: string; size: number };

  if (input.category === 'video') {
    validated = parseAndValidateVideoDataUrl(trimmed);
  } else {
    validated = parseAndValidateDataUrl(trimmed);
  }

  const id = randomUUID();
  const ext = validated.mimeType.split('/')[1]?.replace('svg+xml', 'svg') || 'bin';
  const fileName = `${id}.${ext}`;
  const storagePath = `users/${userId}/${input.category}/${fileName}`;
  const downloadUrl = await uploadAssetFromDataUrl(userId, trimmed, {
    folder: input.category,
    fileName,
  });

  const file: UserFile = {
    id,
    userId,
    name: input.name,
    mimeType: validated.mimeType,
    size: validated.size,
    category: input.category,
    downloadUrl,
    storagePath,
    source: input.source ?? 'upload',
    projectId: input.projectId,
    sourceJobId: input.sourceJobId,
    sourceAssetId: input.sourceAssetId,
    createdAt: new Date().toISOString(),
  };

  await dsSet(FILES_COLLECTION, id, file as unknown as Record<string, unknown>);
  return file;
}

function resolveOwnedStoragePath(userId: string, file: UserFile): string | null {
  if (file.storagePath && isOwnedStoragePath(userId, file.storagePath)) {
    return file.storagePath;
  }
  if (!file.downloadUrl || file.downloadUrl.startsWith('data:')) return null;
  const extracted = extractStoragePathFromUrl(file.downloadUrl);
  if (extracted && isOwnedStoragePath(userId, extracted)) return extracted;
  return null;
}

export async function deleteUserFile(id: string, userId: string): Promise<boolean> {
  const file = await getUserFile(id, userId);
  if (!file) return false;
  const path = resolveOwnedStoragePath(userId, file);
  if (path) {
    await deleteStorageObject(path);
  }
  await dsDelete(FILES_COLLECTION, id);
  return true;
}

export async function saveGeneratedAsset(
  userId: string,
  module: string,
  imageUrl: string,
  extra?: { projectId?: string; sourceJobId?: string }
): Promise<UserFile | null> {
  if (!imageUrl) return null;

  const category: FileCategory =
    module === 'logo' || module === 'profile-pic'
      ? 'logo'
      : module === 'banner'
        ? 'banner'
        : module === 'sticker'
          ? 'sticker'
          : ['overlay', 'facecam', 'stream-start', 'stream-end', 'offline', 'panel', 'alert'].includes(module)
            ? 'overlay'
            : 'other';

  const id = randomUUID();
  const mimeType = imageUrl.startsWith('data:image/svg') ? 'image/svg+xml' : 'image/png';
  const ext = mimeType.split('/')[1]?.replace('svg+xml', 'svg') || 'png';
  const fileName = `${id}.${ext}`;
  const storagePath = `users/${userId}/${category}/${fileName}`;
  let downloadUrl = imageUrl;

  if (!imageUrl.startsWith('data:')) {
    downloadUrl = await uploadAssetFromUrl(userId, imageUrl, { folder: category, fileName });
  } else {
    downloadUrl = await uploadAssetFromDataUrl(userId, imageUrl, {
      folder: category,
      fileName,
    });
  }

  const file: UserFile = {
    id,
    userId,
    name: `${module}-${Date.now()}.png`,
    mimeType,
    size: imageUrl.startsWith('data:') ? Math.round((imageUrl.length * 3) / 4) : 0,
    category,
    downloadUrl,
    storagePath,
    source: 'generation',
    projectId: extra?.projectId,
    sourceJobId: extra?.sourceJobId,
    createdAt: new Date().toISOString(),
  };

  await dsSet(FILES_COLLECTION, id, file as unknown as Record<string, unknown>);
  return file;
}
