import { randomUUID } from 'node:crypto';
import { dsGet, dsSet, dsList, dsListWhere } from '../lib/data-store.js';
import { getJob, runGenerationJob, saveJob } from './ai.service.js';
import { getActiveDna } from './dna.service.js';
import { CoinSpendCategory } from '@ucbs/shared';
import { deductCoins } from './coins.service.js';

export interface ChangeRequestRecord {
  id: string;
  userId: string;
  jobId: string;
  request: string;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  versionBefore?: string;
  versionAfter?: string;
  imageUrlBefore?: string;
  imageUrlAfter?: string;
  createdAt: string;
  completedAt?: string;
}

export interface DesignVersionRecord {
  id: string;
  userId: string;
  jobId: string;
  version: number;
  imageUrl: string;
  changeRequest?: string;
  parentVersionId?: string;
  createdAt: string;
}

const CR_COLLECTION = 'changeRequests';
const VERSION_COLLECTION = 'designVersions';

export async function listChangeRequests(userId: string): Promise<ChangeRequestRecord[]> {
  const requests = await dsList(CR_COLLECTION, { userId, orderBy: 'createdAt', order: 'desc' });
  return requests as unknown as ChangeRequestRecord[];
}

export async function getChangeRequest(id: string, userId: string): Promise<ChangeRequestRecord | null> {
  const cr = await dsGet(CR_COLLECTION, id);
  if (!cr || cr.userId !== userId) return null;
  return cr as unknown as ChangeRequestRecord;
}

export async function getVersionsForJob(jobId: string, userId: string): Promise<DesignVersionRecord[]> {
  const versions = await dsListWhere(VERSION_COLLECTION, { jobId, userId }, 'version', 'asc');
  return versions as unknown as DesignVersionRecord[];
}

export async function createChangeRequest(
  userId: string,
  jobId: string,
  requestText: string
): Promise<ChangeRequestRecord> {
  const job = await getJob(jobId);
  if (!job || job.userId !== userId) {
    throw new Error('Job nicht gefunden');
  }

  const existingVersions = await getVersionsForJob(jobId, userId);
  const currentVersion = existingVersions.length > 0
    ? existingVersions[existingVersions.length - 1]
    : null;

  const imageBefore = currentVersion?.imageUrl ?? job.imageUrl;

  if (!imageBefore) {
    throw new Error('Kein Ausgangsbild vorhanden');
  }

  const coinResult = await deductCoins(userId, CoinSpendCategory.AI_IMAGE, 'Änderungswunsch');
  if (!coinResult.success) {
    throw new Error('Nicht genügend Coins');
  }

  const now = new Date().toISOString();
  const cr: ChangeRequestRecord = {
    id: randomUUID(),
    userId,
    jobId,
    request: requestText,
    status: 'processing',
    versionBefore: currentVersion?.id,
    imageUrlBefore: imageBefore,
    createdAt: now,
  };

  await dsSet(CR_COLLECTION, cr.id, cr as unknown as Record<string, unknown>);

  const activeDna = await getActiveDna(userId);
  if (!activeDna) {
    cr.status = 'rejected';
    cr.completedAt = now;
    await dsSet(CR_COLLECTION, cr.id, cr as unknown as Record<string, unknown>);
    throw new Error('Creator DNA erforderlich');
  }

  const enhancedPrompt = `${requestText}. Based on previous design. Apply these changes while keeping brand consistency.`;
  const newJob = await runGenerationJob(userId, job.module as 'logo' | 'banner' | 'facecam', activeDna, enhancedPrompt);

  const versionNum = existingVersions.length + 1;
  const newVersion: DesignVersionRecord = {
    id: randomUUID(),
    userId,
    jobId,
    version: versionNum,
    imageUrl: newJob.imageUrl || imageBefore,
    changeRequest: requestText,
    parentVersionId: currentVersion?.id,
    createdAt: new Date().toISOString(),
  };

  await dsSet(VERSION_COLLECTION, newVersion.id, newVersion as unknown as Record<string, unknown>);

  cr.status = 'completed';
  cr.versionAfter = newVersion.id;
  cr.imageUrlAfter = newVersion.imageUrl;
  cr.completedAt = new Date().toISOString();
  await dsSet(CR_COLLECTION, cr.id, cr as unknown as Record<string, unknown>);

  return cr;
}

export async function restoreVersion(versionId: string, userId: string): Promise<DesignVersionRecord | null> {
  const version = await dsGet(VERSION_COLLECTION, versionId);
  if (!version || version.userId !== userId) return null;

  const job = await getJob(version.jobId as string);
  if (job) {
    job.imageUrl = version.imageUrl as string;
    await saveJob(job);
  }

  return version as unknown as DesignVersionRecord;
}

export async function compareVersions(changeRequestId: string, userId: string) {
  const cr = await getChangeRequest(changeRequestId, userId);
  if (!cr) return null;
  return {
    before: cr.imageUrlBefore,
    after: cr.imageUrlAfter,
    request: cr.request,
    status: cr.status,
  };
}
