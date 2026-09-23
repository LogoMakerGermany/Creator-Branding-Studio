import { randomUUID } from 'node:crypto';
import type { Project, ProjectAsset, ProjectAssetRole } from '@ucbs/shared';
import {
  boundProjectAssets,
  enforceSingleCurrentRole,
  inferProjectAssetRole,
  isForbiddenProjectAssetUrl,
  isProjectAssetRole,
  isSingularProjectAssetRole,
  matchProjectsByName,
  parseProjectCommand,
  sanitizeProjectAssetUrl,
  PROJECT_MEMORY_BOUNDS,
} from '@ucbs/shared';
import { isDevMode } from '../lib/dev-store.js';
import { getFirestore } from '../config/firebase.js';
import { firestoreDocId, omitUndefinedFields } from '../lib/firestore-payload.js';
import { projectAssetsLockKey, withDevLock } from '../lib/dev-mutex.js';
import { ServiceError } from '../lib/errors.js';
import { getProject, listProjects, updateProject } from './project.service.js';
import { getUserFile } from './file-cloud.service.js';

export interface LinkProjectAssetInput {
  name: string;
  type?: string;
  url?: string;
  jobId?: string;
  fileId?: string;
  module?: string;
  sourceType?: ProjectAsset['sourceType'];
  sourceId?: string;
  mimeType?: string;
  size?: number;
  assetKey?: string;
  parentAssetId?: string;
  version?: number;
  role?: string;
  makeCurrent?: boolean;
}

function assertStoredUrl(url: string | undefined, fileId: string | undefined): string {
  const cleaned = sanitizeProjectAssetUrl(url);
  if (url && isForbiddenProjectAssetUrl(url) && !fileId) {
    throw new ServiceError(400, 'INVALID_ASSET_URL', 'Asset-URL wird nicht gespeichert');
  }
  return cleaned;
}

async function assertOwnedFile(userId: string, fileId: string | undefined): Promise<void> {
  if (!fileId) return;
  const owned = await getUserFile(fileId, userId);
  if (!owned) {
    throw new ServiceError(403, 'FOREIGN_ASSET', 'Asset gehört nicht zu deinem Konto');
  }
}

export async function mutateProjectAssets(
  userId: string,
  projectId: string,
  mutator: (project: Project) => ProjectAsset[]
): Promise<Project> {
  return withDevLock(projectAssetsLockKey(projectId), async () => {
    if (!isDevMode()) {
      const db = getFirestore();
      return db.runTransaction(async (tx) => {
        const ref = db.collection('projects').doc(firestoreDocId(projectId));
        const snap = await tx.get(ref);
        if (!snap.exists) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
        const data = { id: snap.id, ...snap.data() } as unknown as Project;
        if (data.ownerId !== userId || data.deletedAt) {
          throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
        }
        const nextAssets = boundProjectAssets(mutator({ ...data, assets: data.assets ?? [] }));
        const updated: Project = {
          ...data,
          assets: nextAssets,
          updatedAt: new Date().toISOString(),
        };
        tx.set(ref, omitUndefinedFields(updated as unknown as Record<string, unknown>), { merge: true });
        return updated;
      });
    }

    const project = await getProject(projectId, userId);
    if (!project || project.deletedAt) {
      throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
    }
    const nextAssets = boundProjectAssets(mutator(project));
    return updateProject(projectId, userId, { assets: nextAssets });
  });
}

export async function linkAssetToProject(
  userId: string,
  projectId: string,
  input: LinkProjectAssetInput
): Promise<ProjectAsset> {
  if (!input.fileId && !input.jobId && !input.url) {
    throw new ServiceError(400, 'INVALID_ASSET', 'Asset-Referenz fehlt');
  }
  await assertOwnedFile(userId, input.fileId);
  const url = assertStoredUrl(input.url, input.fileId);
  if (!isProjectAssetRole(input.role) && input.role) {
    throw new ServiceError(400, 'INVALID_ASSET_ROLE', 'Ungültige Asset-Rolle');
  }
  const role = inferProjectAssetRole({
    role: input.role,
    type: input.type,
    module: input.module,
    assetKey: input.assetKey,
  });

  const project = await mutateProjectAssets(userId, projectId, (current) => {
    const existing = current.assets.find((a) => {
      if (input.fileId && a.fileId === input.fileId) return true;
      if (input.jobId && a.jobId === input.jobId) return true;
      if (input.sourceId && a.sourceId === input.sourceId) return true;
      return false;
    });
    const hasCurrent = current.assets.some(
      (a) => inferProjectAssetRole(a) === role && a.isCurrent && a.availability !== 'unavailable'
    );
    const makeCurrent = input.makeCurrent === true || (isSingularProjectAssetRole(role) && !hasCurrent);
    if (existing) {
      const patched = current.assets.map((a) =>
        a.id === existing.id
          ? {
              ...a,
              url: url || a.url,
              fileId: input.fileId ?? a.fileId,
              jobId: input.jobId ?? a.jobId,
              role,
              availability: 'available' as const,
              version: input.version ?? a.version,
            }
          : a
      );
      return makeCurrent ? enforceSingleCurrentRole(patched, role, existing.id) : patched;
    }
    if (current.assets.length >= PROJECT_MEMORY_BOUNDS.assets) {
      throw new ServiceError(400, 'ASSET_LIMIT', 'Zu viele Projekt-Assets');
    }
    const asset: ProjectAsset = {
      id: randomUUID(),
      name: (input.name || role).slice(0, 120),
      type: input.type || role,
      url,
      version: input.version ?? 1,
      createdAt: new Date().toISOString(),
      ...(input.jobId ? { jobId: input.jobId } : {}),
      ...(input.fileId ? { fileId: input.fileId } : {}),
      module: input.module,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? input.jobId ?? input.fileId,
      mimeType: input.mimeType,
      size: input.size,
      assetKey: input.assetKey,
      parentAssetId: input.parentAssetId,
      role,
      availability: 'available',
      isCurrent: makeCurrent,
    };
    const next = [...current.assets, asset];
    return makeCurrent ? enforceSingleCurrentRole(next, role, asset.id) : next;
  });

  const linked = project.assets.find(
    (a) =>
      (input.fileId && a.fileId === input.fileId) ||
      (input.jobId && a.jobId === input.jobId) ||
      a.name === (input.name || role)
  );
  if (!linked) throw new ServiceError(500, 'LINK_FAILED', 'Asset konnte nicht verknüpft werden');
  return linked;
}

export async function unlinkAssetFromProject(
  userId: string,
  projectId: string,
  assetId: string
): Promise<Project> {
  return mutateProjectAssets(userId, projectId, (project) => {
    const next = project.assets.filter((a) => a.id !== assetId);
    if (next.length === project.assets.length) {
      throw new ServiceError(404, 'NOT_FOUND', 'Asset nicht im Projekt');
    }
    return next;
  });
}

export async function setCurrentProjectAsset(
  userId: string,
  projectId: string,
  assetId: string,
  role?: ProjectAssetRole
): Promise<Project> {
  return mutateProjectAssets(userId, projectId, (project) => {
    const asset = project.assets.find((a) => a.id === assetId);
    if (!asset) throw new ServiceError(404, 'NOT_FOUND', 'Asset nicht im Projekt');
    if (asset.availability === 'unavailable' || asset.availability === 'missing') {
      throw new ServiceError(409, 'ASSET_UNAVAILABLE', 'Aktuelles Asset ist nicht verfügbar');
    }
    const resolvedRole = role ?? inferProjectAssetRole(asset);
    if (!isProjectAssetRole(resolvedRole)) {
      throw new ServiceError(400, 'INVALID_ASSET_ROLE', 'Ungültige Asset-Rolle');
    }
    const tagged = project.assets.map((a) => (a.id === assetId ? { ...a, role: resolvedRole } : a));
    return enforceSingleCurrentRole(tagged, resolvedRole, assetId);
  });
}

export async function markMissingProjectAssets(userId: string, projectId: string): Promise<Project> {
  return mutateProjectAssets(userId, projectId, (project) => {
    return project.assets.map((asset) => {
      if (!asset.fileId) return asset;
      return asset;
    });
  });
}

export async function listProjectAssets(userId: string, projectId: string): Promise<ProjectAsset[]> {
  const project = await getProject(projectId, userId);
  if (!project || project.deletedAt) {
    throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  }
  const assets = boundProjectAssets(project.assets);
  const resolved: ProjectAsset[] = [];
  for (const asset of assets) {
    if (!asset.fileId) {
      resolved.push({
        ...asset,
        availability: asset.url ? 'available' : asset.availability ?? 'missing',
      });
      continue;
    }
    const owned = await getUserFile(asset.fileId, userId);
    if (!owned) {
      resolved.push({ ...asset, url: '', availability: 'unavailable' });
      continue;
    }
    resolved.push({ ...asset, availability: 'available' });
  }
  return resolved;
}

export async function refreshProjectAssetAvailability(
  userId: string,
  projectId: string
): Promise<Project> {
  const listed = await listProjectAssets(userId, projectId);
  return mutateProjectAssets(userId, projectId, () => listed);
}

export type NexterProjectResolution = {
  status: 'none' | 'resolved' | 'ambiguous' | 'missing' | 'foreign';
  project?: Project;
  candidates?: Array<{ id: string; name: string }>;
  source: 'explicit_id' | 'explicit_name' | 'request' | 'session' | 'none';
};

export async function resolveNexterProject(
  userId: string,
  opts: { message?: string; requestProjectId?: string; sessionProjectId?: string }
): Promise<NexterProjectResolution> {
  const command = parseProjectCommand(opts.message ?? '');
  const named = command.query?.trim();
  if (named) {
    const owned = await listProjects(userId);
    const match = matchProjectsByName(owned, named, { preferActive: true });
    if (match.status === 'unique') {
      const project = await getProject(match.id, userId);
      if (!project) return { status: 'missing', source: 'explicit_name' };
      return { status: 'resolved', project, source: 'explicit_name' };
    }
    if (match.status === 'ambiguous') {
      return { status: 'ambiguous', candidates: match.candidates, source: 'explicit_name' };
    }
    if (match.status === 'missing') return { status: 'missing', source: 'explicit_name' };
  }

  if (opts.requestProjectId?.trim()) {
    const project = await getProject(opts.requestProjectId.trim(), userId);
    if (!project || project.deletedAt) return { status: 'foreign', source: 'request' };
    return { status: 'resolved', project, source: 'request' };
  }

  if (opts.sessionProjectId?.trim()) {
    const project = await getProject(opts.sessionProjectId.trim(), userId);
    if (!project || project.deletedAt) return { status: 'none', source: 'none' };
    return { status: 'resolved', project, source: 'session' };
  }

  return { status: 'none', source: 'none' };
}
