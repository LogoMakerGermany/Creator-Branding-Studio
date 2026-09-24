import { randomUUID } from 'node:crypto';
import { dsGet, dsList, dsSet } from '../lib/data-store.js';
import {
  parseAndValidateDataUrl,
  parseAndValidateVideoDataUrl,
  assertSafeProviderImageUrl,
  PROVIDER_VIDEO_MIME,
  VIDEO_STORAGE_ERROR_CODE,
  VIDEO_STORAGE_ERROR_MESSAGE,
  sniffRasterImageMime,
  MAX_PROVIDER_IMAGE_BYTES,
} from '../lib/upload-validation.js';
import { IMAGE_PROVIDER_FAILED_MESSAGE } from '../lib/media-providers.js';
import { sanitizeZipEntryName } from '../lib/zip-store.js';
import { ServiceError } from '../lib/errors.js';
import {
  extractStoragePathFromUrl,
  isOwnedStoragePath,
  signOwnedStoragePath,
  SIGNED_URL_TTL_MS,
  uploadAssetFromBuffer,
  uploadAssetFromDataUrl,
  uploadAssetFromUrl,
  ownedStorageObjectAvailable,
  deleteOwnedStorageObject,
  downloadOwnedObjectBytes,
} from '../lib/firebase-storage.js';
import { audioExtensionForMime, MUSIC_STORAGE_ERROR_CODE, MUSIC_STORAGE_FAILED_MESSAGE } from '../lib/safe-provider-fetch.js';
import { assertFiniteNumber, firestoreDocId } from '../lib/firestore-payload.js';
import { fileLockKey, withDevLock } from '../lib/dev-mutex.js';

const FILES_COLLECTION = 'files';
export const FILE_LIST_DEFAULT_LIMIT = 50;
export const FILE_LIST_MAX_LIMIT = 100;

let saveGeneratedAssetTestHooks: { fail?: boolean; failAfterUpload?: boolean } | null = null;

export function setSaveGeneratedAssetTestHooks(hooks: { fail?: boolean; failAfterUpload?: boolean } | null): void {
  saveGeneratedAssetTestHooks = hooks;
}

export const FILE_DELETE_INCOMPLETE_MESSAGE = 'Die Datei konnte nicht vollständig gelöscht werden';
export type FileDeletionState = 'active' | 'deleting' | 'deleted' | 'delete_failed';

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
  deletionState?: FileDeletionState;
  /** Admin rights takedown. Blocks new signed URLs. Not a legal determination. */
  rightsTakedownAt?: string;
  createdAt: string;
  expiresAt?: string;
  expiresInMs?: number;
  available?: boolean;
}

function fileIsInactive(file: UserFile): boolean {
  return (
    Boolean(file.deletedAt) ||
    Boolean(file.rightsTakedownAt) ||
    file.deletionState === 'deleting' ||
    file.deletionState === 'deleted' ||
    file.deletionState === 'delete_failed'
  );
}

function assertFiniteFileSize(size: number): number {
  assertFiniteNumber(size, 'NON_FINITE_NUMBER');
  if (!Number.isInteger(size) || size < 0) {
    throw new ServiceError(500, 'INTERNAL_ERROR', 'Ein interner Fehler ist aufgetreten');
  }
  return size;
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
    if (!opts?.includeDeleted && fileIsInactive(file)) return false;
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
  const file = await dsGet(FILES_COLLECTION, firestoreDocId(id));
  if (!isOwnedFileRecord(file, userId)) return null;
  const owned = file as unknown as UserFile;
  if (fileIsInactive(owned)) return null;
  return owned;
}

const DATA_URL_BYTES = /^data:([^;]+);base64,(.+)$/i;
const EDITABLE_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

function decodeOwnedDataUrl(dataUrl: string): Buffer {
  const match = DATA_URL_BYTES.exec(dataUrl.trim());
  if (!match) {
    throw new ServiceError(400, 'INVALID_IMAGE', 'Die Datei ist kein gültiges Bild.');
  }
  const buffer = Buffer.from(match[2]!.replace(/\s/g, ''), 'base64');
  if (!buffer.length) {
    throw new ServiceError(400, 'INVALID_IMAGE', 'Die Datei ist kein gültiges Bild.');
  }
  return buffer;
}

/**
 * Load owned image bytes for server-side provider upload.
 * Never returns or persists a signed URL.
 */
export async function readOwnedImageBytes(
  userId: string,
  fileId: string
): Promise<{ buffer: Buffer; mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; file: UserFile }> {
  const file = await getUserFile(fileId, userId);
  if (!file) {
    throw new ServiceError(403, 'FOREIGN_FILE', 'Die Zieldatei gehört nicht zu deinem Konto oder ist gelöscht.');
  }
  if (file.rightsTakedownAt) {
    throw new ServiceError(403, 'FILE_UNAVAILABLE', 'Die Datei ist nicht verfügbar.');
  }
  const declared = (file.mimeType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (declared && !EDITABLE_IMAGE_MIME.has(declared) && !declared.startsWith('image/')) {
    throw new ServiceError(400, 'UNSUPPORTED_IMAGE', 'Dieser Dateityp kann nicht bearbeitet werden.');
  }

  let buffer: Buffer | null = null;
  if (file.downloadUrl?.startsWith('data:')) {
    buffer = decodeOwnedDataUrl(file.downloadUrl);
  } else if (file.storagePath && isOwnedStoragePath(userId, file.storagePath)) {
    buffer = await downloadOwnedObjectBytes(userId, file.storagePath);
  }
  if (!buffer?.length) {
    throw new ServiceError(404, 'FILE_UNAVAILABLE', 'Die Datei ist nicht verfügbar.');
  }
  if (buffer.length > MAX_PROVIDER_IMAGE_BYTES) {
    throw new ServiceError(400, 'UNSUPPORTED_IMAGE', 'Die Bilddatei ist zu groß.');
  }
  const sniffed = sniffRasterImageMime(buffer);
  if (!sniffed) {
    throw new ServiceError(400, 'INVALID_IMAGE', 'Die Datei ist kein gültiges Bild.');
  }
  return { buffer, mimeType: sniffed, file };
}

async function getOwnedFileRecord(id: string, userId: string): Promise<UserFile | null> {
  const file = await dsGet(FILES_COLLECTION, firestoreDocId(id));
  if (!isOwnedFileRecord(file, userId)) return null;
  return file as unknown as UserFile;
}

export async function getFileRecordById(id: string): Promise<UserFile | null> {
  const file = await dsGet(FILES_COLLECTION, firestoreDocId(id));
  if (!file) return null;
  return file as unknown as UserFile;
}

export async function applyRightsTakedownFlag(id: string, ownerUserId: string): Promise<UserFile | null> {
  const file = await getOwnedFileRecord(id, ownerUserId);
  if (!file) return null;
  const updated: UserFile = {
    ...file,
    rightsTakedownAt: file.rightsTakedownAt ?? new Date().toISOString(),
  };
  await dsSet(FILES_COLLECTION, firestoreDocId(id), updated as unknown as Record<string, unknown>);
  return updated;
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
  if (fileIsInactive(file)) return null;

  if (file.downloadUrl?.startsWith('data:')) {
    return { url: file.downloadUrl, ...downloadExpiry() };
  }

  const path = resolveOwnedStoragePath(userId, file);
  if (!path) return null;
  if (!(await ownedStorageObjectAvailable(userId, path))) return null;

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
  firestoreDocId(id);
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
    size: assertFiniteFileSize(validated.size),
    category: input.category,
    downloadUrl,
    storagePath,
    source: input.source ?? 'upload',
    projectId: input.projectId,
    sourceJobId: input.sourceJobId,
    sourceAssetId: input.sourceAssetId,
    version: input.version,
    deletionState: 'active',
    createdAt: new Date().toISOString(),
  };

  await persistFileMetadata(file);
  return file;
}

async function persistFileMetadata(file: UserFile): Promise<void> {
  try {
    if (saveGeneratedAssetTestHooks?.failAfterUpload) {
      throw new ServiceError(503, 'STORAGE_ERROR', 'Die Datei konnte nicht gespeichert werden');
    }
    await dsSet(FILES_COLLECTION, firestoreDocId(file.id), file as unknown as Record<string, unknown>);
  } catch (err) {
    if (file.storagePath && isOwnedStoragePath(file.userId, file.storagePath)) {
      await deleteOwnedStorageObject(file.userId, file.storagePath).catch(() => undefined);
    }
    throw err;
  }
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
  return withDevLock(fileLockKey(firestoreDocId(id)), () => deleteUserFileLocked(id, userId));
}

async function deleteUserFileLocked(id: string, userId: string): Promise<boolean> {
  const file = await getOwnedFileRecord(id, userId);
  if (!file) return false;
  if (file.deletionState === 'deleted') return true;

  if (!fileIsInactive(file) || file.deletionState === 'delete_failed' || file.deletionState === 'deleting') {
    if (!file.deletedAt && file.deletionState !== 'delete_failed' && file.deletionState !== 'deleting') {
      const refs = await findFileReferences(id, userId);
      if (refs.length) {
        throw new ServiceError(409, 'DELETE_BLOCKED', 'Datei wird noch referenziert und kann nicht gelöscht werden');
      }
    }
  }

  const now = new Date().toISOString();
  const deleting: UserFile = {
    ...file,
    deletedAt: file.deletedAt ?? now,
    deletionState: 'deleting',
  };
  await dsSet(FILES_COLLECTION, firestoreDocId(id), deleting as unknown as Record<string, unknown>);

  const path = resolveOwnedStoragePath(userId, file);
  try {
    if (path) {
      await deleteOwnedStorageObject(userId, path);
    }
  } catch (err) {
    const failed: UserFile = {
      ...deleting,
      deletionState: 'delete_failed',
    };
    await dsSet(FILES_COLLECTION, firestoreDocId(id), failed as unknown as Record<string, unknown>);
    if (err instanceof ServiceError && err.code === 'FORBIDDEN') {
      throw new ServiceError(503, 'DELETE_INCOMPLETE', FILE_DELETE_INCOMPLETE_MESSAGE);
    }
    throw new ServiceError(503, 'DELETE_INCOMPLETE', FILE_DELETE_INCOMPLETE_MESSAGE);
  }

  const finalized: UserFile = {
    ...deleting,
    deletionState: 'deleted',
    deletedAt: deleting.deletedAt ?? now,
  };
  await dsSet(FILES_COLLECTION, firestoreDocId(id), finalized as unknown as Record<string, unknown>);
  return true;
}

function generationCategory(module: string): FileCategory {
  if (module === 'logo' || module === 'profile-pic') return 'logo';
  if (module === 'banner') return 'banner';
  if (module === 'sticker') return 'sticker';
  if (['overlay', 'facecam', 'stream-start', 'stream-end', 'offline', 'panel', 'alert'].includes(module)) {
    return 'overlay';
  }
  return 'other';
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

  const category: FileCategory = generationCategory(module);

  const id = randomUUID();
  firestoreDocId(id);
  const mimeType = imageUrl.startsWith('data:image/svg') ? 'image/svg+xml' : 'image/png';
  const ext = mimeType.split('/')[1]?.replace('svg+xml', 'svg') || 'png';
  const fileName = `${id}.${ext}`;
  const storagePath = `users/${userId}/${category}/${fileName}`;
  let downloadUrl = imageUrl;
  let size = 0;

  if (!imageUrl.startsWith('data:')) {
    downloadUrl = await uploadAssetFromUrl(userId, imageUrl, { folder: category, fileName });
  } else {
    downloadUrl = await uploadAssetFromDataUrl(userId, imageUrl, {
      folder: category,
      fileName,
    });
    const comma = imageUrl.indexOf(',');
    if (comma >= 0) {
      size = Buffer.from(imageUrl.slice(comma + 1), 'base64').length;
    }
  }

  const file: UserFile = {
    id,
    userId,
    name: extra?.name ? sanitizeFileDisplayName(extra.name) : `${module}-${Date.now()}.png`,
    mimeType,
    size: assertFiniteFileSize(size),
    category,
    downloadUrl,
    storagePath,
    source: 'generation',
    projectId: extra?.projectId,
    sourceJobId: extra?.sourceJobId,
    sourceAssetId: extra?.sourceAssetId,
    version: extra?.version ?? 1,
    deletionState: 'active',
    createdAt: new Date().toISOString(),
  };

  await persistFileMetadata(file);
  return file;
}

export async function saveGeneratedAssetFromBuffer(
  userId: string,
  module: string,
  buffer: Buffer,
  extra?: {
    mimeType?: string;
    projectId?: string;
    sourceJobId?: string;
    sourceAssetId?: string;
    name?: string;
    version?: number;
  }
): Promise<UserFile | null> {
  if (!buffer?.length) return null;
  if (saveGeneratedAssetTestHooks?.fail) {
    throw new ServiceError(503, 'STORAGE_ERROR', IMAGE_PROVIDER_FAILED_MESSAGE);
  }
  const mimeType = extra?.mimeType && extra.mimeType.startsWith('image/') ? extra.mimeType : 'image/png';
  const category = generationCategory(module);
  const id = randomUUID();
  firestoreDocId(id);
  const ext = mimeType.split('/')[1]?.replace('svg+xml', 'svg') || 'png';
  const fileName = `${id}.${ext}`;
  const storagePath = `users/${userId}/${category}/${fileName}`;
  const downloadUrl = await uploadAssetFromBuffer(userId, buffer, {
    folder: category,
    fileName,
    contentType: mimeType,
    extension: ext,
  });
  const file: UserFile = {
    id,
    userId,
    name: extra?.name ? sanitizeFileDisplayName(extra.name) : `${module}-${Date.now()}.png`,
    mimeType,
    size: assertFiniteFileSize(buffer.length),
    category,
    downloadUrl,
    storagePath,
    source: 'generation',
    projectId: extra?.projectId,
    sourceJobId: extra?.sourceJobId,
    sourceAssetId: extra?.sourceAssetId,
    version: extra?.version ?? 1,
    deletionState: 'active',
    createdAt: new Date().toISOString(),
  };
  await persistFileMetadata(file);
  return file;
}

export async function saveGeneratedAudioFile(
  userId: string,
  input: {
    name: string;
    mimeType: string;
    buffer: Buffer;
    projectId?: string;
    sourceJobId?: string;
    version?: number;
  }
): Promise<UserFile> {
  if (saveGeneratedAssetTestHooks?.fail) {
    throw new ServiceError(503, MUSIC_STORAGE_ERROR_CODE, MUSIC_STORAGE_FAILED_MESSAGE);
  }
  if (input.projectId) {
    await assertOwnedProject(userId, input.projectId);
  }
  const id = randomUUID();
  firestoreDocId(id);
  const ext = audioExtensionForMime(input.mimeType);
  const fileName = sanitizeZipEntryName(`${id}.${ext}`, `${id}.bin`);
  const storagePath = `users/${userId}/other/${fileName}`;
  let downloadUrl: string;
  try {
    downloadUrl = await uploadAssetFromBuffer(userId, input.buffer, {
      folder: 'other',
      fileName,
      contentType: input.mimeType,
      extension: ext,
    });
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    throw new ServiceError(503, MUSIC_STORAGE_ERROR_CODE, MUSIC_STORAGE_FAILED_MESSAGE);
  }
  const file: UserFile = {
    id,
    userId,
    name: sanitizeFileDisplayName(input.name),
    mimeType: input.mimeType,
    size: assertFiniteFileSize(input.buffer.length),
    category: 'other',
    downloadUrl,
    storagePath,
    source: 'generation',
    projectId: input.projectId,
    sourceJobId: input.sourceJobId,
    version: input.version,
    deletionState: 'active',
    createdAt: new Date().toISOString(),
  };
  try {
    if (saveGeneratedAssetTestHooks?.failAfterUpload) {
      throw new ServiceError(503, MUSIC_STORAGE_ERROR_CODE, MUSIC_STORAGE_FAILED_MESSAGE);
    }
    await dsSet(
      FILES_COLLECTION,
      firestoreDocId(id),
      Object.fromEntries(Object.entries(file).filter(([, v]) => v !== undefined)) as Record<string, unknown>
    );
  } catch (err) {
    if (isOwnedStoragePath(userId, storagePath)) {
      await deleteOwnedStorageObject(userId, storagePath).catch(() => undefined);
    }
    throw err;
  }
  return file;
}

export async function saveGeneratedVideoFile(
  userId: string,
  input: {
    name: string;
    buffer: Buffer;
    mimeType?: string;
    projectId?: string;
    sourceJobId?: string;
    version?: number;
  }
): Promise<UserFile> {
  if (saveGeneratedAssetTestHooks?.fail) {
    throw new ServiceError(503, VIDEO_STORAGE_ERROR_CODE, VIDEO_STORAGE_ERROR_MESSAGE);
  }
  if (input.projectId) {
    await assertOwnedProject(userId, input.projectId);
  }
  if (input.mimeType && input.mimeType !== PROVIDER_VIDEO_MIME) {
    throw new ServiceError(502, VIDEO_STORAGE_ERROR_CODE, VIDEO_STORAGE_ERROR_MESSAGE);
  }
  const mimeType = PROVIDER_VIDEO_MIME;
  const id = randomUUID();
  firestoreDocId(id);
  const fileName = sanitizeZipEntryName(`${id}.mp4`, `${id}.mp4`);
  const storagePath = `users/${userId}/videos/${fileName}`;
  let downloadUrl: string;
  try {
    downloadUrl = await uploadAssetFromBuffer(userId, input.buffer, {
      folder: 'videos',
      fileName,
      contentType: mimeType,
      extension: 'mp4',
    });
  } catch (err) {
    if (err instanceof ServiceError) {
      throw new ServiceError(503, VIDEO_STORAGE_ERROR_CODE, VIDEO_STORAGE_ERROR_MESSAGE);
    }
    throw new ServiceError(503, VIDEO_STORAGE_ERROR_CODE, VIDEO_STORAGE_ERROR_MESSAGE);
  }
  const file: UserFile = {
    id,
    userId,
    name: sanitizeFileDisplayName(input.name),
    mimeType,
    size: assertFiniteFileSize(input.buffer.length),
    category: 'video',
    downloadUrl,
    storagePath,
    source: 'generation',
    projectId: input.projectId,
    sourceJobId: input.sourceJobId,
    version: input.version,
    deletionState: 'active',
    createdAt: new Date().toISOString(),
  };
  try {
    if (saveGeneratedAssetTestHooks?.failAfterUpload) {
      throw new ServiceError(503, VIDEO_STORAGE_ERROR_CODE, VIDEO_STORAGE_ERROR_MESSAGE);
    }
    await dsSet(
      FILES_COLLECTION,
      firestoreDocId(id),
      Object.fromEntries(Object.entries(file).filter(([, v]) => v !== undefined)) as Record<string, unknown>
    );
  } catch (err) {
    if (isOwnedStoragePath(userId, storagePath)) {
      await deleteOwnedStorageObject(userId, storagePath).catch(() => undefined);
    }
    if (err instanceof ServiceError) throw err;
    throw new ServiceError(503, VIDEO_STORAGE_ERROR_CODE, VIDEO_STORAGE_ERROR_MESSAGE);
  }
  return file;
}

export async function getUserStorageUsage(userId: string): Promise<{
  uploadBytes: number;
  generatedBytes: number;
  totalBytes: number;
  uploadCount: number;
  generatedCount: number;
}> {
  const files = await listUserFiles(userId);
  let uploadBytes = 0;
  let generatedBytes = 0;
  let uploadCount = 0;
  let generatedCount = 0;
  for (const file of files) {
    const size = typeof file.size === 'number' && Number.isFinite(file.size) && file.size >= 0 ? file.size : 0;
    if (file.source === 'generation') {
      generatedBytes += size;
      generatedCount += 1;
    } else {
      uploadBytes += size;
      uploadCount += 1;
    }
  }
  return {
    uploadBytes,
    generatedBytes,
    totalBytes: uploadBytes + generatedBytes,
    uploadCount,
    generatedCount,
  };
}
