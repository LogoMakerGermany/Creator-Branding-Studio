import { randomUUID } from 'node:crypto';
import { CoinSpendCategory, type CreatorDNA, type NexterQuoteKind } from '@ucbs/shared';
import { dsGet, dsSet, dsList, dsListWhere } from '../lib/data-store.js';
import { getJob, runGenerationJob, saveJob, type GenerationJob } from './ai.service.js';
import { resolveDnaForRequest } from './dna.service.js';
import { withCoinCharge } from '../lib/billable-job.js';
import { attachAssetToProject } from './project-assets.service.js';
import { ServiceError } from '../lib/errors.js';
import { AppError } from '../middleware/errorHandler.js';
import { QUOTE_KIND_CATEGORY } from './nexter/tools.service.js';

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
  quoteId?: string;
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

const IMAGE_KIND_BY_MODULE: Record<string, NexterQuoteKind> = {
  logo: 'logo',
  'profile-pic': 'logo',
  banner: 'banner',
  facecam: 'facecam',
  sticker: 'sticker',
  overlay: 'overlay',
  'stream-start': 'overlay',
  'stream-end': 'overlay',
  offline: 'overlay',
  panel: 'overlay',
  alert: 'overlay',
};

export function changeModuleToQuoteKind(module: string): NexterQuoteKind | null {
  return IMAGE_KIND_BY_MODULE[module] ?? null;
}

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

export async function getOwnedJobForChange(jobId: string, userId: string): Promise<GenerationJob> {
  const job = await getJob(jobId);
  if (!job || job.userId !== userId) {
    throw new ServiceError(404, 'NOT_FOUND', 'Job nicht gefunden');
  }
  const kind = changeModuleToQuoteKind(job.module);
  if (!kind) {
    throw new ServiceError(400, 'CHANGE_NOT_SUPPORTED', 'Änderungen sind für diesen Asset-Typ nicht als Bild-Variante verfügbar.');
  }
  if (!job.imageUrl) {
    throw new ServiceError(400, 'NO_IMAGE', 'Kein Ausgangsbild vorhanden');
  }
  return job;
}

export function buildChangePrompt(dna: CreatorDNA, requestText: string, previousPrompt?: string): string {
  const lockLine = [
    dna.locks?.name ? `LOCKED name ${dna.name} — do not rename` : null,
    dna.locks?.colors ? `LOCKED colors ${dna.primaryColors.join(', ')} — keep this color family` : null,
    dna.locks?.character || dna.locks?.mascot
      ? `LOCKED character ${dna.character?.description || dna.mascot} — do not replace the figure`
      : null,
    dna.locks?.style ? `LOCKED style ${dna.styleDirection}` : null,
    dna.locks?.typography || dna.locks?.fonts ? 'LOCKED typography — keep lettering style' : null,
  ]
    .filter(Boolean)
    .join('. ');

  return [
    previousPrompt,
    `AI variation of the existing design (not a pixel-precise layer edit): ${requestText}`,
    'Keep brand identity and composition. Do not invent a different mascot or color family when locked.',
    lockLine,
  ]
    .filter(Boolean)
    .join('. ');
}

async function seedOriginalVersion(
  userId: string,
  jobId: string,
  imageUrl: string
): Promise<DesignVersionRecord[]> {
  const existing = await getVersionsForJob(jobId, userId);
  if (existing.length > 0) return existing;
  const original: DesignVersionRecord = {
    id: randomUUID(),
    userId,
    jobId,
    version: 1,
    imageUrl,
    changeRequest: 'Original',
    createdAt: new Date().toISOString(),
  };
  await dsSet(VERSION_COLLECTION, original.id, original as unknown as Record<string, unknown>);
  return [original];
}

export async function executeQuotedChangeRequest(
  userId: string,
  jobId: string,
  requestText: string,
  projectId?: string
): Promise<{
  changeRequest: ChangeRequestRecord;
  coinsSpent: number;
  newBalance: number;
  jobIds: string[];
}> {
  const job = await getOwnedJobForChange(jobId, userId);
  const kind = changeModuleToQuoteKind(job.module)!;
  const category: CoinSpendCategory = QUOTE_KIND_CATEGORY[kind];
  const resolvedProjectId = projectId || job.projectId;
  const { dna } = await resolveDnaForRequest(userId, resolvedProjectId);
  if (!dna) {
    throw new ServiceError(400, 'NO_DNA', 'Creator DNA erforderlich');
  }

  const versions = await seedOriginalVersion(userId, job.id, job.imageUrl!);
  const currentVersion = versions[versions.length - 1];
  const imageBefore = currentVersion?.imageUrl ?? job.imageUrl!;

  const now = new Date().toISOString();
  const cr: ChangeRequestRecord = {
    id: randomUUID(),
    userId,
    jobId: job.id,
    request: requestText,
    status: 'processing',
    versionBefore: currentVersion?.id,
    imageUrlBefore: imageBefore,
    createdAt: now,
  };
  await dsSet(CR_COLLECTION, cr.id, cr as unknown as Record<string, unknown>);

  const prompt = buildChangePrompt(dna, requestText, job.prompt);

  try {
    const billed = await withCoinCharge(userId, category, `Änderungswunsch ${kind}`, async () => {
      return runGenerationJob(userId, job.module, dna, prompt, {
        assetKey: job.assetKey,
      });
    });

    const newJob = billed.job;
    const imageAfter = newJob.imageUrl || imageBefore;
    const newVersion: DesignVersionRecord = {
      id: randomUUID(),
      userId,
      jobId: job.id,
      version: versions.length + 1,
      imageUrl: imageAfter,
      changeRequest: requestText,
      parentVersionId: currentVersion?.id,
      createdAt: new Date().toISOString(),
    };
    await dsSet(VERSION_COLLECTION, newVersion.id, newVersion as unknown as Record<string, unknown>);

    job.imageUrl = imageAfter;
    if (job.exports) {
      job.exports = { ...job.exports, png: imageAfter, hd: imageAfter };
    }
    await saveJob(job);

    if (resolvedProjectId) {
      await attachAssetToProject(userId, resolvedProjectId, {
        name: job.assetKey || job.module,
        type: job.module,
        url: imageAfter,
        jobId: job.id,
        module: job.module,
        sourceType: 'generation',
        version: newVersion.version,
        assetKey: job.assetKey,
      }).catch(() => undefined);
    }

    cr.status = 'completed';
    cr.versionAfter = newVersion.id;
    cr.imageUrlAfter = imageAfter;
    cr.completedAt = new Date().toISOString();
    await dsSet(CR_COLLECTION, cr.id, cr as unknown as Record<string, unknown>);

    return {
      changeRequest: cr,
      coinsSpent: billed.coinsSpent,
      newBalance: billed.newBalance,
      jobIds: [newJob.id],
    };
  } catch (err) {
    cr.status = 'rejected';
    cr.completedAt = new Date().toISOString();
    await dsSet(CR_COLLECTION, cr.id, cr as unknown as Record<string, unknown>);
    if (err instanceof ServiceError) throw err;
    if (err instanceof AppError) {
      throw new ServiceError(err.statusCode, err.code, err.message);
    }
    throw err;
  }
}

/** Restore an existing design version onto the original job. 0 coins. */
export async function restoreVersion(versionId: string, userId: string): Promise<DesignVersionRecord | null> {
  const version = await dsGet(VERSION_COLLECTION, versionId);
  if (!version || version.userId !== userId) return null;

  const job = await getJob(version.jobId as string);
  if (!job || job.userId !== userId) return null;

  job.imageUrl = version.imageUrl as string;
  if (job.exports) {
    job.exports = { ...job.exports, png: job.imageUrl, hd: job.imageUrl };
  }
  await saveJob(job);

  if (job.projectId) {
    await attachAssetToProject(userId, job.projectId, {
      name: job.assetKey || job.module,
      type: job.module,
      url: job.imageUrl,
      jobId: job.id,
      module: job.module,
      sourceType: 'generation',
      version: version.version as number,
      assetKey: job.assetKey,
    }).catch(() => undefined);
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
