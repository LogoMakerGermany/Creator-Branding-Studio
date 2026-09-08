import type {
  Project,
  ProjectStatus,
  ProjectType,
  ProjectAsset,
  CreatorDNA,
  StyleDirection,
} from '@ucbs/shared';
import { STYLE_DIRECTIONS } from '@ucbs/shared';
import { randomUUID } from 'node:crypto';
import { dsDelete, dsGet, dsListWhere, dsSet } from '../lib/data-store.js';
import { ServiceError } from '../lib/errors.js';
import { parseAndValidateProjectZipDataUrl } from '../lib/upload-validation.js';
import { getZipEntry, listZipEntries, parseZipArchive } from '../lib/zip-store.js';
import { uploadAssetFromDataUrl } from '../lib/firebase-storage.js';
import { getDnaById, upsertDna } from './dna.service.js';
import { saveUserFile, type FileCategory } from './file-cloud.service.js';

const COLLECTION = 'projects';

export const PROJECT_LIST_DEFAULT_LIMIT = 50;
export const PROJECT_LIST_MAX_LIMIT = 100;
export const PROJECT_NAME_MAX = 120;

export type ProjectListSort = 'updated' | 'newest' | 'oldest' | 'name';
export type ProjectListFilter = 'active' | 'archived';

export interface ProjectWriteInput {
  name: string;
  description?: string;
  type: ProjectType;
  dnaId?: string;
  status?: ProjectStatus;
}

export function sanitizeProjectName(name: string): string {
  const cleaned = name.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!cleaned) {
    throw new ServiceError(400, 'INVALID_NAME', 'Projektname erforderlich');
  }
  if (cleaned.length > PROJECT_NAME_MAX) {
    throw new ServiceError(400, 'INVALID_NAME', 'Projektname zu lang');
  }
  return cleaned;
}

function normalizeProject(raw: Project): Project {
  return {
    ...raw,
    assignedTo: raw.assignedTo ?? [],
    assets: raw.assets ?? [],
    feedback: raw.feedback ?? [],
    deletedAt: raw.deletedAt,
  };
}

export async function listProjects(
  userId: string,
  opts?: { includeDeleted?: boolean }
): Promise<Project[]> {
  const rows = await dsListWhere(COLLECTION, { ownerId: userId }, 'updatedAt', 'desc');
  const projects = (rows as unknown as Project[]).map(normalizeProject);
  if (opts?.includeDeleted) return projects;
  return projects.filter((p) => !p.deletedAt);
}

export async function listTrash(userId: string): Promise<Project[]> {
  const all = await listProjects(userId, { includeDeleted: true });
  return all.filter((p) => Boolean(p.deletedAt));
}

export async function queryProjects(
  userId: string,
  opts?: {
    q?: string;
    type?: ProjectType;
    filter?: ProjectListFilter;
    sort?: ProjectListSort;
    limit?: number;
    offset?: number;
  }
): Promise<{ projects: Project[]; total: number }> {
  const filter = opts?.filter === 'archived' ? 'archived' : 'active';
  const sort: ProjectListSort = opts?.sort ?? 'updated';
  const limit = Math.min(PROJECT_LIST_MAX_LIMIT, Math.max(1, opts?.limit ?? PROJECT_LIST_DEFAULT_LIMIT));
  const offset = Math.max(0, opts?.offset ?? 0);
  const includeDeleted = filter === 'archived';
  let rows = includeDeleted ? await listTrash(userId) : await listProjects(userId);
  if (opts?.type) {
    rows = rows.filter((p) => p.type === opts.type);
  }
  const q = opts?.q?.trim().toLowerCase();
  if (q) {
    rows = rows.filter((p) => {
      if (p.name.toLowerCase().includes(q) || p.type.toLowerCase().includes(q)) return true;
      return (p.assets ?? []).some((a) => a.name.toLowerCase().includes(q));
    });
  }
  rows = [...rows].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'de');
    if (sort === 'newest') return b.createdAt.localeCompare(a.createdAt);
    if (sort === 'oldest') return a.createdAt.localeCompare(b.createdAt);
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  return { projects: rows.slice(offset, offset + limit), total: rows.length };
}

export async function getProject(id: string, userId: string): Promise<Project | null> {
  const row = await dsGet(COLLECTION, id);
  if (!row || row.ownerId !== userId) return null;
  return normalizeProject(row as unknown as Project);
}

export async function createProject(userId: string, input: ProjectWriteInput): Promise<Project> {
  const now = new Date().toISOString();
  const project: Project = {
    id: randomUUID(),
    name: sanitizeProjectName(input.name),
    description: input.description?.trim(),
    status: input.status ?? 'draft',
    type: input.type,
    ownerId: userId,
    dnaId: input.dnaId,
    assignedTo: [],
    assets: [],
    feedback: [],
    createdAt: now,
    updatedAt: now,
  };
  await dsSet(COLLECTION, project.id, project as unknown as Record<string, unknown>);
  return project;
}

export async function duplicateProject(id: string, userId: string): Promise<Project> {
  const existing = await getProject(id, userId);
  if (!existing || existing.deletedAt) throw new Error('Projekt nicht gefunden');
  return createProject(userId, {
    name: `${existing.name} (Kopie)`,
    description: existing.description,
    type: existing.type,
    dnaId: existing.dnaId,
    status: 'draft',
  });
}

export async function updateProject(
  id: string,
  userId: string,
  patch: Partial<ProjectWriteInput> & { assets?: ProjectAsset[] }
): Promise<Project> {
  const existing = await getProject(id, userId);
  if (!existing) throw new Error('Projekt nicht gefunden');
  if (existing.deletedAt) {
    throw new Error('Projekt ist im Papierkorb');
  }

  const updated: Project = {
    ...existing,
    name: patch.name !== undefined ? sanitizeProjectName(patch.name) : existing.name,
    description: patch.description ?? existing.description,
    type: patch.type ?? existing.type,
    status: patch.status ?? existing.status,
    dnaId: patch.dnaId ?? existing.dnaId,
    assets: patch.assets ?? existing.assets,
    updatedAt: new Date().toISOString(),
  };
  await dsSet(COLLECTION, id, updated as unknown as Record<string, unknown>);
  return updated;
}

export async function softDeleteProject(id: string, userId: string): Promise<Project> {
  const existing = await getProject(id, userId);
  if (!existing) throw new Error('Projekt nicht gefunden');
  const updated: Project = {
    ...existing,
    status: 'archived',
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await dsSet(COLLECTION, id, updated as unknown as Record<string, unknown>);
  return updated;
}

export async function restoreProject(id: string, userId: string): Promise<Project> {
  const existing = await getProject(id, userId);
  if (!existing) throw new Error('Projekt nicht gefunden');
  const updated: Project = {
    ...existing,
    status: 'draft',
    deletedAt: undefined,
    updatedAt: new Date().toISOString(),
  };
  await dsSet(COLLECTION, id, updated as unknown as Record<string, unknown>);
  return updated;
}

export async function purgeProject(id: string, userId: string): Promise<boolean> {
  const existing = await getProject(id, userId);
  if (!existing) return false;
  await dsDelete(COLLECTION, id);
  return true;
}

/** JSON-only fallback without binary assets. */
export async function exportProjectManifest(
  id: string,
  userId: string
): Promise<{ project: Project; exportUrl: null; assets: ProjectAsset[]; exportedAt: string }> {
  const project = await getProject(id, userId);
  if (!project) throw new Error('Projekt nicht gefunden');
  return {
    project,
    exportUrl: null,
    assets: project.assets,
    exportedAt: new Date().toISOString(),
  };
}

const PROJECT_TYPES: ProjectType[] = [
  'logo',
  'branding',
  'banner',
  'video',
  'intro',
  'overlay',
  'full_package',
  'custom',
  'streamset',
  'mockup',
  'shorts',
  'social',
  'text',
];

const FILE_CATEGORIES = new Set<FileCategory>([
  'logo',
  'banner',
  'video',
  'project',
  'overlay',
  'sticker',
  'other',
]);

export interface ImportCheck {
  step: 'zip' | 'manifest' | 'dna' | 'assets' | 'cloud' | 'project';
  ok: boolean;
  message: string;
}

export interface ImportProjectResult {
  project: Project;
  dnaImported: boolean;
  assetsImported: number;
  cloudFilesImported: number;
  checks: ImportCheck[];
  importedAt: string;
}

function mimeFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    pdf: 'application/pdf',
    json: 'application/json',
    zip: 'application/zip',
  };
  return map[ext] ?? 'application/octet-stream';
}

function bufferToDataUrl(buf: Buffer, mime: string): string {
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function isStyleDirection(value: unknown): value is StyleDirection {
  return typeof value === 'string' && (STYLE_DIRECTIONS as string[]).includes(value);
}

function isProjectType(value: unknown): value is ProjectType {
  return typeof value === 'string' && (PROJECT_TYPES as string[]).includes(value);
}

/**
 * Restores a project from a UCBS ZIP export:
 * validate → import DNA → upload assets → update store → create project.
 */
export async function importProjectZip(
  userId: string,
  zipDataUrl: string,
  options?: { importDna?: boolean; importCloud?: boolean }
): Promise<ImportProjectResult> {
  const importDna = options?.importDna !== false;
  const importCloud = options?.importCloud !== false;
  const checks: ImportCheck[] = [];
  const importedAt = new Date().toISOString();

  let zipBuffer: Buffer;
  try {
    ({ buffer: zipBuffer } = parseAndValidateProjectZipDataUrl(zipDataUrl));
    checks.push({
      step: 'zip',
      ok: true,
      message: `ZIP gelesen (${Math.round(zipBuffer.length / 1024)} KB)`,
    });
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    throw new ServiceError(400, 'INVALID_ZIP', err instanceof Error ? err.message : 'ZIP ungültig');
  }

  let entries;
  try {
    entries = parseZipArchive(zipBuffer);
  } catch (err) {
    throw new ServiceError(
      400,
      'INVALID_ZIP',
      err instanceof Error ? err.message : 'ZIP konnte nicht gelesen werden'
    );
  }

  const manifestEntry = getZipEntry(entries, 'manifest.json');
  if (!manifestEntry) {
    throw new ServiceError(400, 'INVALID_MANIFEST', 'manifest.json fehlt in der ZIP-Datei');
  }

  let manifest: {
    exportedAt?: string;
    project?: Partial<Project>;
    dna?: CreatorDNA | null;
    assets?: ProjectAsset[];
  };
  try {
    manifest = JSON.parse(manifestEntry.data.toString('utf8')) as typeof manifest;
  } catch {
    throw new ServiceError(400, 'INVALID_MANIFEST', 'manifest.json ist kein gültiges JSON');
  }

  const sourceProject = manifest.project;
  if (!sourceProject?.name || typeof sourceProject.name !== 'string') {
    throw new ServiceError(400, 'INVALID_MANIFEST', 'Manifest enthält keinen gültigen Projektnamen');
  }

  const projectType: ProjectType = isProjectType(sourceProject.type) ? sourceProject.type : 'custom';
  const assetMeta = Array.isArray(manifest.assets)
    ? manifest.assets
    : Array.isArray(sourceProject.assets)
      ? sourceProject.assets
      : [];

  checks.push({
    step: 'manifest',
    ok: true,
    message: `Manifest OK · Projekt „${sourceProject.name.trim()}“ · ${assetMeta.length} Asset-Metadaten`,
  });

  let dnaId: string | undefined;
  let dnaImported = false;

  if (importDna && manifest.dna && typeof manifest.dna === 'object') {
    const dna = manifest.dna;
    const dnaFiles = listZipEntries(entries, 'dna').sort((a, b) => a.name.localeCompare(b.name));
    const sourceAssets = [...(dna.sourceAssets ?? [])];

    for (let i = 0; i < Math.min(sourceAssets.length, dnaFiles.length); i++) {
      const file = dnaFiles[i];
      const mime = mimeFromPath(file.name);
      if (!mime.startsWith('image/') && mime !== 'application/pdf') continue;
      try {
        const url = await uploadAssetFromDataUrl(userId, bufferToDataUrl(file.data, mime), {
          folder: 'dna-imports',
          fileName: `${randomUUID()}.${mime.split('/')[1]?.replace('svg+xml', 'svg') || 'bin'}`,
        });
        sourceAssets[i] = { ...sourceAssets[i], url };
      } catch {
        // keep original URL if re-upload fails
      }
    }

    const saved = await upsertDna({
      userId,
      name: typeof dna.name === 'string' && dna.name.trim() ? dna.name.trim() : sourceProject.name.trim(),
      clanName: dna.clanName,
      mascot: dna.mascot,
      styleDirection: isStyleDirection(dna.styleDirection) ? dna.styleDirection : 'custom',
      primaryColors: dna.primaryColors,
      secondaryColors: dna.secondaryColors,
      accentColors: dna.accentColors,
      targetPlatforms: dna.platformOptimization?.map((p) => p.platform),
      favoriteGenres: dna.favoriteGenres,
      gamingStyle: dna.gamingStyle,
      brandingStyle: dna.brandingStyle,
      promptStyle: dna.promptStyle,
      visualLanguage: dna.visualLanguage,
      animations: dna.animations,
      personalGuidelines: dna.personalGuidelines,
      fonts: dna.fonts,
      brandingRules: dna.brandingRules,
      aiAnalysis: dna.aiAnalysis,
      sourceAssets,
      targetAudience: dna.targetAudience,
      designLanguage: dna.designLanguage,
    });
    dnaId = saved.id;
    dnaImported = true;
    checks.push({
      step: 'dna',
      ok: true,
      message: `Creator-DNA „${saved.name}“ importiert (${dnaFiles.length} Referenz-Dateien)`,
    });
  } else {
    checks.push({
      step: 'dna',
      ok: true,
      message: importDna ? 'Keine DNA im Archiv' : 'DNA-Import übersprungen',
    });
  }

  const zipAssets = listZipEntries(entries, 'assets').sort((a, b) => a.name.localeCompare(b.name));
  const restoredAssets: ProjectAsset[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < zipAssets.length; i++) {
    const file = zipAssets[i];
    const meta = assetMeta[i];
    const mime = mimeFromPath(file.name);
    const baseName = file.name.split('/').pop()?.replace(/\.[^.]+$/, '') || `asset-${i + 1}`;
    try {
      const url = await uploadAssetFromDataUrl(userId, bufferToDataUrl(file.data, mime), {
        folder: 'project-imports',
        fileName: `${randomUUID()}.${mime.split('/')[1]?.replace('svg+xml', 'svg') || 'bin'}`,
      });
      restoredAssets.push({
        id: randomUUID(),
        name: meta?.name || baseName,
        type: meta?.type || mime.split('/')[0] || 'file',
        url,
        version: meta?.version ?? 1,
        createdAt: meta?.createdAt ?? now,
      });
    } catch {
      // skip failed asset
    }
  }

  // Manifest assets without matching ZIP binaries: keep only if we already restored enough
  checks.push({
    step: 'assets',
    ok: true,
    message: `${restoredAssets.length} von ${zipAssets.length} Projekt-Assets hochgeladen`,
  });

  let cloudFilesImported = 0;
  if (importCloud) {
    const cloudEntries = listZipEntries(entries, 'cloud');
    for (const file of cloudEntries) {
      const parts = file.name.split('/');
      // cloud/<category>/<filename>
      const categoryRaw = parts[1] || 'other';
      const category: FileCategory = FILE_CATEGORIES.has(categoryRaw as FileCategory)
        ? (categoryRaw as FileCategory)
        : 'other';
      const mime = mimeFromPath(file.name);
      const name = parts[parts.length - 1] || `cloud-${cloudFilesImported + 1}`;

      // Skip oversized non-video for saveUserFile limits; upload via storage + manual record otherwise
      try {
        if (category === 'video' || mime === 'video/mp4') {
          await saveUserFile(userId, {
            name,
            mimeType: 'video/mp4',
            category: 'video',
            dataUrl: bufferToDataUrl(file.data, 'video/mp4'),
            source: 'upload',
          });
          cloudFilesImported++;
        } else if (
          mime.startsWith('image/') ||
          mime === 'application/pdf' ||
          mime === 'application/json'
        ) {
          // Direct storage upload to avoid tight 5MB path when files are larger but still in ZIP budget
          const id = randomUUID();
          const ext = mime.split('/')[1]?.replace('svg+xml', 'svg') || 'bin';
          const fileName = `${id}.${ext}`;
          const storagePath = `users/${userId}/${category}/${fileName}`;
          const downloadUrl = await uploadAssetFromDataUrl(
            userId,
            bufferToDataUrl(file.data, mime),
            {
              folder: category,
              fileName,
            }
          );
          await dsSet('files', id, {
            id,
            userId,
            name,
            mimeType: mime,
            size: file.data.length,
            category,
            downloadUrl,
            storagePath,
            source: 'upload',
            createdAt: now,
          });
          cloudFilesImported++;
        }
      } catch {
        // skip individual cloud file failures
      }
    }
    checks.push({
      step: 'cloud',
      ok: true,
      message: `${cloudFilesImported} Cloud-Dateien wiederhergestellt`,
    });
  } else {
    checks.push({
      step: 'cloud',
      ok: true,
      message: 'Cloud-Import übersprungen',
    });
  }

  const project = await createProject(userId, {
    name: sourceProject.name.trim().slice(0, 120),
    description:
      typeof sourceProject.description === 'string'
        ? sourceProject.description.slice(0, 1000)
        : `Importiert am ${importedAt.slice(0, 10)}`,
    type: projectType,
    dnaId,
    status: 'draft',
  });

  const restored = await updateProject(project.id, userId, {
    assets: restoredAssets,
    dnaId,
  });

  checks.push({
    step: 'project',
    ok: true,
    message: `Projekt „${restored.name}“ wiederhergestellt`,
  });

  return {
    project: restored,
    dnaImported,
    assetsImported: restoredAssets.length,
    cloudFilesImported,
    checks,
    importedAt,
  };
}
