import { randomUUID } from 'node:crypto';
import type { UltimateCreatorProject, UltimateCreatorWizardInput, UltimatePackAsset } from '@ucbs/shared';
import { ULTIMATE_PACK_V1 } from '@ucbs/shared';
import { buildStyleToken } from '@ucbs/shared';
import { dsGet, dsSet, dsList } from '../../lib/data-store.js';

const COLLECTION = 'ultimate_creator_projects';

function emptyAssets(): UltimatePackAsset[] {
  const now = new Date().toISOString();
  return ULTIMATE_PACK_V1.map((a) => ({
    id: randomUUID(),
    key: a.key,
    label: a.label,
    module: a.module,
    status: 'pending' as const,
    version: 1,
    createdAt: now,
  }));
}

export async function listUltimateProjects(userId: string): Promise<UltimateCreatorProject[]> {
  const items = await dsList(COLLECTION, { userId, orderBy: 'updatedAt', order: 'desc', limit: 50 });
  return items as unknown as UltimateCreatorProject[];
}

export async function getUltimateProject(id: string, userId: string): Promise<UltimateCreatorProject | null> {
  const doc = await dsGet(COLLECTION, id);
  if (!doc || doc.userId !== userId) return null;
  return doc as unknown as UltimateCreatorProject;
}

export async function createUltimateProject(
  userId: string,
  wizard: UltimateCreatorWizardInput,
  dnaId?: string
): Promise<UltimateCreatorProject> {
  const now = new Date().toISOString();
  const project: UltimateCreatorProject = {
    id: randomUUID(),
    userId,
    name: wizard.name.trim(),
    status: 'draft',
    version: 1,
    wizard,
    tags: ['ultimate-creator', wizard.style.toLowerCase()],
    platforms: wizard.platforms,
    styleToken: buildStyleToken(wizard),
    dnaId,
    logoJobIds: [],
    assets: emptyAssets(),
    aiHistory: [],
    exportStatus: {},
    createdAt: now,
    updatedAt: now,
  };
  await dsSet(COLLECTION, project.id, project as unknown as Record<string, unknown>);
  return project;
}

export async function saveUltimateProject(project: UltimateCreatorProject): Promise<void> {
  await dsSet(COLLECTION, project.id, {
    ...project,
    updatedAt: new Date().toISOString(),
  } as unknown as Record<string, unknown>);
}

export async function setActiveProjectForUser(_userId: string, _projectId: string | null): Promise<void> {
  /* active project tracked client-side; optional server preference later */
}
