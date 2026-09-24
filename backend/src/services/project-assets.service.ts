import { randomUUID } from 'node:crypto';
import type { Project, ProjectAsset, ProjectAssetSourceType } from '@ucbs/shared';
import { inferProjectAssetRole, isForbiddenProjectAssetUrl, sanitizeProjectAssetUrl } from '@ucbs/shared';
import { getProject, updateProject } from './project.service.js';
import { getUserFile } from './file-cloud.service.js';
import { ServiceError } from '../lib/errors.js';

export interface AttachAssetInput {
  name: string;
  type: string;
  url: string;
  jobId?: string;
  fileId?: string;
  module?: string;
  sourceType?: ProjectAssetSourceType;
  sourceId?: string;
  mimeType?: string;
  size?: number;
  assetKey?: string;
  parentAssetId?: string;
  version?: number;
}

export function findAttachedAsset(project: Project, input: AttachAssetInput): ProjectAsset | undefined {
  return project.assets.find((a) => {
    if (input.jobId && a.jobId === input.jobId) return true;
    if (input.fileId && a.fileId === input.fileId) return true;
    if (input.sourceId && a.sourceId === input.sourceId) return true;
    if (
      input.url &&
      a.url === input.url &&
      !input.jobId &&
      !input.fileId &&
      !input.sourceId
    ) {
      return true;
    }
    return false;
  });
}

/** Reference-only attach. Does not copy bytes. Idempotent by jobId/fileId/url. Does not auto-replace a current asset. */
export async function attachAssetToProject(
  userId: string,
  projectId: string,
  input: AttachAssetInput
): Promise<ProjectAsset | null> {
  if (!projectId) return null;
  const storedUrl = sanitizeProjectAssetUrl(input.url);
  if (!storedUrl && !input.fileId && !input.jobId && !input.name) return null;
  if (input.url && isForbiddenProjectAssetUrl(input.url) && !input.fileId && !input.jobId && !input.name) return null;
  const project = await getProject(projectId, userId);
  if (!project || project.deletedAt) return null;

  if (input.fileId) {
    const owned = await getUserFile(input.fileId, userId);
    if (!owned) return null;
  }

  const existing = findAttachedAsset(project, input);
  const role = inferProjectAssetRole({
    type: input.type,
    module: input.module,
    assetKey: input.assetKey,
  });
  if (existing) {
    if (existing.url !== storedUrl || (input.version && existing.version !== input.version)) {
      const next = project.assets.map((a) =>
        a.id === existing.id
          ? {
              ...a,
              url: storedUrl,
              version: input.version ?? a.version,
              mimeType: input.mimeType ?? a.mimeType,
              fileId: input.fileId ?? a.fileId,
              role: existing.role ?? role,
            }
          : a
      );
      await updateProject(projectId, userId, { assets: next });
      return next.find((a) => a.id === existing.id) ?? existing;
    }
    return existing;
  }

  const hasCurrent = project.assets.some((a) => (a.role ?? inferProjectAssetRole(a)) === role && a.isCurrent);
  const asset: ProjectAsset = {
    id: randomUUID(),
    name: input.name,
    type: input.type,
    url: storedUrl,
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
    isCurrent: !hasCurrent,
  };

  await updateProject(projectId, userId, { assets: [...project.assets, asset] });
  return asset;
}

/** Removes the ProjectAsset link only. Does not delete the File Cloud record. */
export async function detachAssetFromProject(
  userId: string,
  projectId: string,
  assetId: string
): Promise<Project> {
  const project = await getProject(projectId, userId);
  if (!project || project.deletedAt) {
    throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  }
  const next = project.assets.filter((a) => a.id !== assetId);
  if (next.length === project.assets.length) {
    throw new ServiceError(404, 'NOT_FOUND', 'Asset nicht im Projekt');
  }
  return updateProject(projectId, userId, { assets: next });
}
