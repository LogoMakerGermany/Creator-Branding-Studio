import { randomUUID } from 'node:crypto';
import { dsGet, dsList, dsSet } from '../lib/data-store.js';
import {
  parseAndValidateDataUrl,
  parseAndValidateVideoDataUrl,
  assertSafeProviderImageUrl,
} from '../lib/upload-validation.js';
import { IMAGE_PROVIDER_FAILED_MESSAGE } from '../lib/media-providers.js';
import { sanitizeZipEntryName } from '../lib/zip-store.js';
import { ServiceError } from '../lib/errors.js';
import {
  extractStoragePathFromUrl,
  isOwnedStoragePath,
  signOwnedStoragePath,
  SIGNED_URL_TTL_MS,
  uploadAssetFromDataUrl,
  uploadAssetFromUrl,
} from '../lib/firebase-storage.js';

const FILES_COLLECTION = 'files';
export const FILE_LIST_DEFAULT_LIMIT = 50;
export const FILE_LIST_MAX_LIMIT = 100;

let saveGeneratedAssetTestHooks: { fail?: boolean } | null = null;

export function setSaveGeneratedAssetTestHooks(hooks: { fail?: boolean } | null): void {
  saveGeneratedAssetTestHooks = hooks;
}

export type FileCategory = 'logo' | 'banner' | 'video' | 'project' | 'overlay' | 'sticker' | 'other';
export type FileKindFilter = 'all' | 'image' | 'video' | 'audio' | 'other';
export type FileSort = 'newest' | 'oldest' | 'name' | 'name-desc' | 'size';
export type FileSourceFilter = 'upload' | 'generation';

export interface FileListQuery {
  projectId?: string;
  q?: string;
  category?: FileCategory | 'all';
  kind?: FileKindFilter;
  source?: FileSourceFilter;
  sort?: FileSort;
  limit?: number;
  offset?: number;
}

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
  version?: number;
  deletedAt?: string;
  createdAt: string;
  expiresAt?: string;
  expiresInMs?: number;
  available?: boolean;
}

function isOwnedFileRecord(file: Record<string, unknown> | null, userId: string): boolean {
  if (!file) return false;
  const owner = file.userId;
  return typeof owner === 'string' && owner.length > 0 && owner === userId;
}

function fileKind(file: UserFile): FileKindFilter | 'other' {
  if (file.mimeType.startsWith('video/') || file.category === 'video') return 'video';
  if (file.mimeType.startsWith('audio/')) return 'audio';
  if (file.mimeType.startsWith('image/') || ['logo', 'banner', 'overlay', 'sticker'].includes(file.category)) {
    return 'image';
  }
  return 'other';
}

export function sanitizeFileDisplayName(name: unknown): string {
  if (typeof name !== 'string') {
    throw new ServiceError(400, 'INVALID_NAME', 'Dateiname erforderlich');
  }
  const trimmed = name.normalize('NFC').replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!trimmed) {
    throw new ServiceError(400, 'INVALID_NAME', 'Dateiname darf nicht leer sein');
  }
  const noSlash = trimmed.replace(/\\/g, '/');
  const parts = noSlash.split('/').filter((p) => p && p !== '.' && p !== '..');
  const base = (parts.pop() || '').replace(/\.\./g, '').trim();
  if (!base) {
    throw new ServiceError(400, 'INVALID_NAME', 'Dateiname ungültig');
  }
  return base.slice(0, 200);
}

async function filterOwnedFiles(
  userId: string,
  files: UserFile[],
  opts?: FileListQuery & { includeDeleted?: boolean }
): Promise<UserFile[]> {
  let assetFileIds: Set<string> | null = null;
  if (opts?.projectId) {
    const project = await dsGet('projects', opts.projectId);
    if (!project || project.ownerId !== userId || project.deletedAt) return [];
    assetFileIds = new Set(
      ((project.assets as Array<{ fileId?: string }> | undefined) ?? [])
        .map((a) => a.fileId)
        .filter((id): id is string => Boolean(id))
    );
  }
  return files.filter((file) => {
    if (!isOwnedFileRecord(file as unknown as Record<string, unknown>, userId)) return false;
    if (!opts?.includeDeleted && file.deletedAt) return false;
    if (opts?.projectId) {
      const linked = file.projectId === opts.projectId || Boolean(assetFileIds?.has(file.id));
      if (!linked) return false;
    }
    if (opts?.category && opts.category !== 'all' && file.category !== opts.category) return false;
    if (opts?.kind && opts.kind !== 'all' && fileKind(file) !== opts.kind) return false;
    if (opts?.source && file.source !== opts.source) return false;
    if (opts?.q) {
      const q = opts.q.trim().toLowerCase();
      const hay = `${file.name} ${file.category} ${file.projectId ?? ''} ${file.source ?? ''} ${file.sourceJobId ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export async function listUserFiles(
  userId: string,
  opts?: FileListQuery & { includeDeleted?: boolean }
): Promise<UserFile[]> {
  const files = (await dsList(FILES_COLLECTION, { userId, orderBy: 'createdAt', order: 'desc' })) as unknown as UserFile[];
  return filterOwnedFiles(userId, files, opts);
}

export function sortUserFiles(files: UserFile[], sort: FileSort = 'newest'): UserFile[] {
  const copy = [...files];
  copy.sort((a, b) => {
    if (sort === 'oldest') return a.createdAt.localeCompare(b.createdAt);
    if (sort === 'name') return a.name.localeCompare(b.name, 'de');
    if (sort === 'name-desc') return b.name.localeCompare(a.name, 'de');
    if (sort === 'size') return (b.size || 0) - (a.size || 0);
    return b.createdAt.localeCompare(a.createdAt);
  });
  return copy;
}

function fileLooksAvailable(userId: string, file: UserFile): boolean {
  if (file.downloadUrl?.startsWith('data:')) return true;
  return Boolean(resolveOwnedStoragePath(userId, file));
}

export function countUserFiles(files: UserFile[]): { total: number; image: number; video: number; audio: number } {
  return {
    total: files.length,
    image: files.filter((f) => fileKind(f) === 'image').length,
    video: files.filter((f) => fileKind(f) === 'video').length,
    audio: files.filter((f) => fileKind(f) === 'audio').length,
  };
}

export async function getFileBySourceJobId(userId: string, jobId: string): Promise<UserFile | null> {
  const files = await listUserFiles(userId);
  return files.find((file) => file.sourceJobId === jobId) ?? null;
}

export async function getUserFile(id: string, userId: string): Promise<UserFile | null> {
  const file = await dsGet(FILES_COLLECTION, id);
  if (!isOwnedFileRecord(file, userId)) return null;
  if ((file as { deletedAt?: string }).deletedAt) return null;
  return file as unknown as UserFile;
}

export async function getRecentUserFiles(userId: string, opts?: { category?: FileCategory; limit?: number }): Promise<UserFile[]> {
  const files = await listUserFiles(userId, { category: opts?.category, sort: 'newest' });
  return sortUserFiles(files, 'newest').slice(0, opts?.limit ?? 5);
}

export interface IssuedFileDownload {
  file: UserFile;
  downloadUrl: string;
  expiresAt: string;
  expiresInMs: number;
}

function downloadExpiry(): { expiresAt: string; expiresInMs: number } {
  return {
    expiresAt: new Date(Date.now() + SIGNED_URL_TTL_MS).toISOString(),
    expiresInMs: SIGNED_URL_TTL_MS,
  };
}

/**
 * Mint a download URL from the stored file record only.
 * Never accepts a client-supplied storage path.
 */
export async function mintDownloadUrlForOwnedFile(
  userId: string,
  file: UserFile,
  sign?: (path: string, ttlMs?: number) => Promise<string>
): Promise<{ url: string; expiresAt: string; expiresInMs: number } | null> {
  if (!isOwnedFileRecord(file as unknown as Record<string, unknown>, userId)) return null;
  if (file.deletedAt) return null;

  if (file.downloadUrl?.startsWith('data:')) {
    return { url: file.downloadUrl, ...downloadExpiry() };
  }

  const path = resolveOwnedStoragePath(userId, file);
  if (!path) return null;

  const url = await signOwnedStoragePath(userId, path, sign);
  return { url, ...downloadExpiry() };
}

/** Client-facing file without storagePath. Fresh downloadUrl when available. */
export function toClientFile(file: UserFile, downloadUrl?: string, extras?: { missing?: boolean; expiresAt?: string; expiresInMs?: number }): UserFile {
  return {
    id: file.id,
    userId: file.userId,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    category: file.category,
    downloadUrl,
    source: file.source,
    projectId: file.projectId,
    sourceJobId: file.sourceJobId,
    sourceAssetId: file.sourceAssetId,
    version: file.version,
    createdAt: file.createdAt,
    expiresAt: extras?.expiresAt,
    expiresInMs: extras?.expiresInMs,
    available: extras?.missing ? false : downloadUrl ? true : extras?.missing === false,
  };
}

export async function issueFileDownloadUrl(
  fileId: string,
  userId: string,
  sign?: (path: string, ttlMs?: number) => Promise<string>
): Promise<IssuedFileDownload | null> {
  const file = await getUserFile(fileId, userId);
  if (!file) return null;

  const minted = await mintDownloadUrlForOwnedFile(userId, file, sign);
  if (!minted) {
    throw new ServiceError(410, 'FILE_MISSING', 'Datei nicht verfügbar');
  }

  return {
    file: toClientFile(file, minted.url),
    downloadUrl: minted.url,
    expiresAt: minted.expiresAt,
    expiresInMs: minted.expiresInMs,
  };
}

export async function listUserFilesForClient(
  userId: string,
  opts?: FileListQuery
): Promise<UserFile[]> {
  const page = await queryUserFilesForClient(userId, opts);
  return page.files;
}

export async function queryUserFilesForClient(
  userId: string,
  opts?: FileListQuery
): Promise<{ files: UserFile[]; total: number; counts: ReturnType<typeof countUserFiles> }> {
  const all = await listUserFiles(userId);
  const counts = countUserFiles(all);
  const filtered = sortUserFiles(await filterOwnedFiles(userId, all, opts), opts?.sort ?? 'newest');
  const offset = Math.max(0, opts?.offset ?? 0);
  const limit = Math.min(FILE_LIST_MAX_LIMIT, Math.max(1, opts?.limit ?? FILE_LIST_DEFAULT_LIMIT));
  const slice = filtered.slice(offset, offset + limit);
  return {
    files: slice.map((file) =>
      toClientFile(file, undefined, {
        missing: !fileLooksAvailable(userId, file),
      })
    ),
    total: filtered.length,
    counts,
  };
}

export async function getUserFileWithData(
  id: string,
  userId: string
): Promise<(UserFile & { dataUrl: string }) | null> {
  const issued = await issueFileDownloadUrl(id, userId);
  if (!issued) return null;
  return { ...issued.file, dataUrl: issued.downloadUrl };
}

async function assertOwnedProject(userId: string, projectId: string): Promise<void> {
  const project = await dsGet('projects', projectId);
  if (!project || project.ownerId !== userId || project.deletedAt) {
    throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  }
}

function rowReferencesFile(row: Record<string, unknown>, fileId: string): boolean {
  if (row.fileId === fileId || row.sourceFileId === fileId || row.renderFileId === fileId || row.mediaAssetId === fileId) {
    return true;
  }
  const meta = row.metadata as Record<string, unknown> | undefined;
  if (meta && meta.fileId === fileId) return true;
  const assets = row.assets as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(assets) && assets.some((a) => a.fileId === fileId)) return true;
  return false;
}

export async function findFileReferences(fileId: string, userId: string): Promise<string[]> {
  const refs: string[] = [];
  const collections = ['generationJobs', 'videoProjects', 'socialPosts', 'mediaJobs', 'changeRequests'];
  for (const collection of collections) {
    const rows = await dsList(collection, { userId });
    if (rows.some((row) => rowReferencesFile(row, fileId))) refs.push(collection);
  }
  const { listProjects } = await import('./project.service.js');
  const projects = await listProjects(userId);
  if (projects.some((p) => (p.assets ?? []).some((a) => a.fileId === fileId))) {
    refs.push('projects');
  }
  return refs;
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
    version?: number;
  }
): Promise<UserFile> {
  const trimmed = input.dataUrl.trim();
  let validated: { mimeType: string; size: number };

  if (input.category === 'video') {
    validated = parseAndValidateVideoDataUrl(trimmed);
  } else {
    validated = parseAndValidateDataUrl(trimmed);
  }

  if (input.projectId) {
    await assertOwnedProject(userId, input.projectId);
  }

  const id = randomUUID();
  const ext = validated.mimeType.split('/')[1]?.replace('svg+xml', 'svg') || 'bin';
  const fileName = sanitizeZipEntryName(`${id}.${ext}`, `${id}.bin`);
  const storagePath = `users/${userId}/${input.category}/${fileName}`;
  const downloadUrl = await uploadAssetFromDataUrl(userId, trimmed, {
    folder: input.category,
    fileName,
  });

  const file: UserFile = {
    id,
    userId,
    name: sanitizeFileDisplayName(input.name),
    mimeType: validated.mimeType,
    size: validated.size,
    category: input.category,
    downloadUrl,
    storagePath,
    source: input.source ?? 'upload',
    projectId: input.projectId,
    sourceJobId: input.sourceJobId,
    sourceAssetId: input.sourceAssetId,
    version: input.version,
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

export async function unlinkFileFromProjects(userId: string, fileId: string): Promise<void> {
  const { listProjects } = await import('./project.service.js');
  const { detachAssetFromProject } = await import('./project-assets.service.js');
  const projects = await listProjects(userId);
  for (const project of projects) {
    for (const asset of project.assets ?? []) {
      if (asset.fileId === fileId) {
        await detachAssetFromProject(userId, project.id, asset.id).catch(() => undefined);
      }
    }
  }
}

export async function getFileRelations(
  fileId: string,
  userId: string
): Promise<{
  usage: Array<{ projectId: string; projectName: string; assetId: string }>;
  versions: UserFile[];
  references: string[];
}> {
  const file = await getUserFile(fileId, userId);
  const { listProjects } = await import('./project.service.js');
  const projects = await listProjects(userId);
  const usage: Array<{ projectId: string; projectName: string; assetId: string }> = [];
  for (const project of projects) {
    for (const asset of project.assets ?? []) {
      if (asset.fileId === fileId) {
        usage.push({ projectId: project.id, projectName: project.name, assetId: asset.id });
      }
    }
  }
  const all = await listUserFiles(userId);
  const rootId = file?.sourceAssetId || fileId;
  const versions = sortUserFiles(
    all.filter(
      (f) =>
        f.id === fileId ||
        f.id === rootId ||
        f.sourceAssetId === rootId ||
        f.sourceAssetId === fileId ||
        (file?.sourceJobId && f.sourceJobId === file.sourceJobId)
    ),
    'oldest'
  ).map((f) => toClientFile(f));
  const references = await findFileReferences(fileId, userId);
  return { usage, versions, references };
}

export async function updateUserFile(
  id: string,
  userId: string,
  data: { name?: string; projectId?: string | null }
): Promise<UserFile> {
  const file = await getUserFile(id, userId);
  if (!file) throw new ServiceError(404, 'NOT_FOUND', 'Datei nicht gefunden');
  if (data.projectId) {
    await assertOwnedProject(userId, data.projectId);
  }
  if (data.projectId === null) {
    await unlinkFileFromProjects(userId, id);
  }
  const updated: UserFile = {
    ...file,
    name: data.name != null ? sanitizeFileDisplayName(data.name) : file.name,
    projectId: data.projectId === null ? undefined : data.projectId ?? file.projectId,
  };
  if (data.projectId === null) delete updated.projectId;
  await dsSet(FILES_COLLECTION, id, updated as unknown as Record<string, unknown>);
  return updated;
}

export async function deleteUserFile(id: string, userId: string): Promise<boolean> {
  const file = await getUserFile(id, userId);
  if (!file) return false;
  const refs = await findFileReferences(id, userId);
  if (refs.length) {
    throw new ServiceError(409, 'DELETE_BLOCKED', 'Datei wird noch referenziert und kann nicht gelöscht werden');
  }
  const updated: UserFile = { ...file, deletedAt: new Date().toISOString() };
  await dsSet(FILES_COLLECTION, id, updated as unknown as Record<string, unknown>);
  return true;
}

export async function saveGeneratedAsset(
  userId: string,
  module: string,
  imageUrl: string,
  extra?: { projectId?: string; sourceJobId?: string; sourceAssetId?: string; name?: string; version?: number }
): Promise<UserFile | null> {
  if (!imageUrl) return null;
  if (saveGeneratedAssetTestHooks?.fail) {
    throw new ServiceError(503, 'STORAGE_ERROR', IMAGE_PROVIDER_FAILED_MESSAGE);
  }
  assertSafeProviderImageUrl(imageUrl);

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
    name: extra?.name ? sanitizeFileDisplayName(extra.name) : `${module}-${Date.now()}.png`,
    mimeType,
    size: imageUrl.startsWith('data:') ? Math.round((imageUrl.length * 3) / 4) : 0,
    category,
    downloadUrl,
    storagePath,
    source: 'generation',
    projectId: extra?.projectId,
    sourceJobId: extra?.sourceJobId,
    sourceAssetId: extra?.sourceAssetId,
    version: extra?.version ?? 1,
    createdAt: new Date().toISOString(),
  };

  await dsSet(FILES_COLLECTION, id, file as unknown as Record<string, unknown>);
  return file;
}
