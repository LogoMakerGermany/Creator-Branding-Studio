import { randomUUID } from 'node:crypto';
import type { Project, ProjectAsset, ProjectAssetSourceType } from '@ucbs/shared';
import { getProject, updateProject } from './project.service.js';

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

/** Reference-only attach. Does not copy bytes. Idempotent by jobId/fileId/url. */
export async function attachAssetToProject(
  userId: string,
  projectId: string,
  input: AttachAssetInput
): Promise<ProjectAsset | null> {
  if (!projectId || !input.url) return null;
  const project = await getProject(projectId, userId);
  if (!project || project.deletedAt) return null;

  const existing = findAttachedAsset(project, input);
  if (existing) {
    if (existing.url !== input.url || (input.version && existing.version !== input.version)) {
      const next = project.assets.map((a) =>
        a.id === existing.id
          ? {
              ...a,
              url: input.url,
              version: input.version ?? a.version,
              mimeType: input.mimeType ?? a.mimeType,
              fileId: input.fileId ?? a.fileId,
            }
          : a
      );
      await updateProject(projectId, userId, { assets: next });
      return next.find((a) => a.id === existing.id) ?? existing;
    }
    return existing;
  }

  const asset: ProjectAsset = {
    id: randomUUID(),
    name: input.name,
    type: input.type,
    url: input.url,
    version: input.version ?? 1,
    createdAt: new Date().toISOString(),
    jobId: input.jobId,
    fileId: input.fileId,
    module: input.module,
    sourceType: input.sourceType,
    sourceId: input.sourceId ?? input.jobId ?? input.fileId,
    mimeType: input.mimeType,
    size: input.size,
    assetKey: input.assetKey,
  };

  await updateProject(projectId, userId, { assets: [...project.assets, asset] });
  return asset;
}
