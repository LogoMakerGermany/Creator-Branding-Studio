import { randomUUID } from 'node:crypto';
import { CoinSpendCategory, type CreatorDNA, type NexterQuoteKind } from '@ucbs/shared';
import { dsGet, dsSet, dsList, dsListWhere } from '../lib/data-store.js';
import { getJob, runGenerationJob, saveJob, type GenerationJob } from './ai.service.js';
import { resolveDnaForRequest } from './dna.service.js';
import { withCoinCharge } from '../lib/billable-job.js';
import { attachAssetToProject } from './project-assets.service.js';
import { getUserFile, issueFileDownloadUrl } from './file-cloud.service.js';
import { listProjects } from './project.service.js';
import { ServiceError } from '../lib/errors.js';
import { AppError } from '../middleware/errorHandler.js';
import { QUOTE_KIND_CATEGORY } from './nexter/tools.service.js';

export const CHANGE_TEXT_MIN = 3;
export const CHANGE_TEXT_MAX = 500;

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
  fileIdBefore?: string;
  fileIdAfter?: string;
  quoteId?: string;
  scope?: 'asset' | 'set' | 'dna';
  createdAt: string;
  completedAt?: string;
}

export interface ChangeableSource {
  id: string;
  kind: NexterQuoteKind;
  module: string;
  label: string;
  fileId?: string;
  projectId?: string;
  version?: number;
  createdAt: string;
  resultKind: 'image' | 'audio' | 'video' | 'other';
  batchId?: string;
  assetKey?: string;
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

const MEDIA_KIND_BY_MODULE: Record<string, NexterQuoteKind> = {
  animation: 'animation',
  music: 'music',
  voice: 'voice',
  mockup: 'mockup',
  streamset: 'streamset',
};

const SOURCE_LABELS: Record<string, string> = {
  logo: 'Logo',
  'profile-pic': 'Profilbild',
  banner: 'Banner',
  facecam: 'Facecam',
  sticker: 'Sticker',
  overlay: 'Overlay',
  animation: 'Animation',
  music: 'Musik',
  voice: 'Stimme',
  mockup: 'Mockup',
  streamset: 'Streamset',
  video: 'Video',
};

export function changeModuleToQuoteKind(module: string): NexterQuoteKind | null {
  return IMAGE_KIND_BY_MODULE[module] ?? MEDIA_KIND_BY_MODULE[module] ?? null;
}

export function sanitizeChangeText(request: unknown): string {
  if (typeof request !== 'string') {
    throw new ServiceError(400, 'INVALID_CHANGE', 'Änderungswunsch erforderlich');
  }
  const trimmed = request.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!trimmed) {
    throw new ServiceError(400, 'INVALID_CHANGE', 'Änderungswunsch darf nicht leer sein');
  }
  if (trimmed.length < CHANGE_TEXT_MIN) {
    throw new ServiceError(400, 'INVALID_CHANGE', 'Bitte den Änderungswunsch etwas genauer beschreiben');
  }
  if (trimmed.length > CHANGE_TEXT_MAX) {
    throw new ServiceError(400, 'INVALID_CHANGE', `Maximal ${CHANGE_TEXT_MAX} Zeichen`);
  }
  return trimmed;
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
    throw new ServiceError(404, 'NOT_FOUND', 'Ergebnis nicht gefunden');
  }
  const kind = IMAGE_KIND_BY_MODULE[job.module];
  if (!kind) {
    throw new ServiceError(400, 'CHANGE_NOT_SUPPORTED', 'Änderungen sind für diesen Asset-Typ nicht als Bild-Variante verfügbar.');
  }
  if (!job.imageUrl) {
    throw new ServiceError(410, 'SOURCE_MISSING', 'Die Ausgangsdatei fehlt oder wurde gelöscht.');
  }
  return job;
}

export async function resolveChangeSource(
  userId: string,
  ref: { jobId?: string; fileId?: string; projectAssetId?: string; projectId?: string }
): Promise<ChangeableSource> {
  if (ref.fileId) {
    const file = await getUserFile(ref.fileId, userId);
    if (!file) {
      throw new ServiceError(410, 'SOURCE_MISSING', 'Datei nicht gefunden oder gelöscht.');
    }
    if (file.sourceJobId) {
      return resolveChangeSource(userId, { jobId: file.sourceJobId, projectId: ref.projectId || file.projectId });
    }
    throw new ServiceError(
      400,
      'CHANGE_NOT_SUPPORTED',
      'Für diesen Upload gibt es keine KI-Änderung. Nutze ein Studio-Ergebnis.'
    );
  }

  if (ref.projectAssetId) {
    const projects = await listProjects(userId);
    for (const project of projects) {
      const asset = (project.assets ?? []).find((a) => a.id === ref.projectAssetId);
      if (!asset) continue;
      if (asset.jobId) return resolveChangeSource(userId, { jobId: asset.jobId, projectId: project.id });
      if (asset.fileId) return resolveChangeSource(userId, { fileId: asset.fileId, projectId: project.id });
      throw new ServiceError(410, 'SOURCE_MISSING', 'Dieses Projekt-Asset hat keine verknüpfte Datei.');
    }
    throw new ServiceError(404, 'NOT_FOUND', 'Projekt-Asset nicht gefunden');
  }

  if (!ref.jobId) {
    throw new ServiceError(400, 'INVALID_CHANGE', 'Bitte ein eigenes Ergebnis auswählen.');
  }

  const job = await getJob(ref.jobId);
  if (!job || job.userId !== userId) {
    throw new ServiceError(404, 'NOT_FOUND', 'Ergebnis nicht gefunden');
  }
  const kind = changeModuleToQuoteKind(job.module);
  if (!kind) {
    throw new ServiceError(400, 'CHANGE_NOT_SUPPORTED', 'Für diesen Typ gibt es keine KI-Änderung über Änderungswünsche.');
  }
  if (IMAGE_KIND_BY_MODULE[job.module] && !job.imageUrl) {
    throw new ServiceError(410, 'SOURCE_MISSING', 'Die Ausgangsdatei fehlt oder wurde gelöscht.');
  }
  const versions = await getVersionsForJob(job.id, userId).catch(() => []);
  return {
    id: job.id,
    kind,
    module: job.module,
    label: SOURCE_LABELS[job.module] || SOURCE_LABELS[kind] || kind,
    fileId: job.fileId,
    projectId: ref.projectId || job.projectId,
    version: versions.length || 1,
    createdAt: job.createdAt,
    resultKind: resultKindForModule(job.module),
    batchId: job.batchId,
    assetKey: job.assetKey,
  };
}

function resultKindForModule(module: string): ChangeableSource['resultKind'] {
  if (module === 'music' || module === 'voice') return 'audio';
  if (module === 'video' || module === 'animation') return 'video';
  return 'image';
}

function sourceFromJob(job: GenerationJob, version?: number): ChangeableSource | null {
  const kind = changeModuleToQuoteKind(job.module);
  if (!kind) return null;
  if (IMAGE_KIND_BY_MODULE[job.module] && !job.imageUrl) return null;
  return {
    id: job.id,
    kind,
    module: job.module,
    label: job.assetKey
      ? `${SOURCE_LABELS[job.module] || kind} · ${job.assetKey}`
      : SOURCE_LABELS[job.module] || SOURCE_LABELS[kind] || kind,
    fileId: job.fileId,
    projectId: job.projectId,
    version: version || 1,
    createdAt: job.createdAt,
    resultKind: resultKindForModule(job.module),
    batchId: job.batchId,
    assetKey: job.assetKey,
  };
}

export async function listChangeableSources(userId: string): Promise<ChangeableSource[]> {
  const { getJobsByUser } = await import('./ai.service.js');
  const jobs = await getJobsByUser(userId);
  const out: ChangeableSource[] = [];
  const seen = new Set<string>();
  for (const job of jobs) {
    if (job.status !== 'completed') continue;
    const row = sourceFromJob(job);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }

  const addMedia = (
    rows: Array<{ id: string; createdAt: string; projectId?: string; fileId?: string; status?: string }>,
    kind: NexterQuoteKind,
    resultKind: ChangeableSource['resultKind']
  ) => {
    for (const row of rows) {
      if (row.status && row.status !== 'completed') continue;
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push({
        id: row.id,
        kind,
        module: kind,
        label: SOURCE_LABELS[kind] || kind,
        fileId: row.fileId,
        projectId: row.projectId,
        version: 1,
        createdAt: row.createdAt,
        resultKind,
      });
    }
  };

  const [{ listMockups }, { listAnimations }, { listMusic }, { listVoice }, { listVideoProjects }] = await Promise.all([
    import('./mockup.service.js'),
    import('./animation.service.js'),
    import('./music.service.js'),
    import('./voice.service.js'),
    import('./media.service.js'),
  ]);
  addMedia(await listMockups(userId), 'mockup', 'image');
  addMedia(await listAnimations(userId), 'animation', 'video');
  addMedia(await listMusic(userId), 'music', 'audio');
  addMedia(await listVoice(userId), 'voice', 'audio');
  const videos = await listVideoProjects(userId);
  for (const video of videos) {
    if (seen.has(video.id)) continue;
    seen.add(video.id);
    out.push({
      id: video.id,
      kind: 'captions',
      module: 'video',
      label: video.title || 'Video',
      projectId: undefined,
      version: 1,
      createdAt: video.createdAt,
      resultKind: 'video',
    });
  }

  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out;
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

export async function recordJobVersion(
  userId: string,
  jobId: string,
  imageUrl: string,
  label?: string
): Promise<DesignVersionRecord> {
  const existing = await getVersionsForJob(jobId, userId);
  const previous = existing[existing.length - 1];
  const row: DesignVersionRecord = {
    id: randomUUID(),
    userId,
    jobId,
    version: existing.length + 1,
    imageUrl,
    changeRequest: label || (existing.length ? 'Neue Version' : 'Original'),
    parentVersionId: previous?.id,
    createdAt: new Date().toISOString(),
  };
  await dsSet(VERSION_COLLECTION, row.id, row as unknown as Record<string, unknown>);
  return row;
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
  const kind = IMAGE_KIND_BY_MODULE[job.module]!;
  const category: CoinSpendCategory = QUOTE_KIND_CATEGORY[kind];
  const resolvedProjectId = projectId || job.projectId;
  const { dna } = await resolveDnaForRequest(userId, resolvedProjectId);
  if (!dna) {
    throw new ServiceError(400, 'NO_DNA', 'Creator DNA erforderlich');
  }

  const safeRequest = sanitizeChangeText(requestText);
  const versions = await seedOriginalVersion(userId, job.id, job.imageUrl!);
  const currentVersion = versions[versions.length - 1];
  const imageBefore = currentVersion?.imageUrl ?? job.imageUrl!;

  const now = new Date().toISOString();
  const cr: ChangeRequestRecord = {
    id: randomUUID(),
    userId,
    jobId: job.id,
    request: safeRequest,
    status: 'processing',
    versionBefore: currentVersion?.id,
    imageUrlBefore: imageBefore,
    fileIdBefore: job.fileId,
    scope: 'asset',
    createdAt: now,
  };
  await dsSet(CR_COLLECTION, cr.id, cr as unknown as Record<string, unknown>);

  const prompt = buildChangePrompt(dna, safeRequest, job.prompt);

  try {
    const billed = await withCoinCharge(userId, category, `Änderungswunsch ${kind}`, async () => {
      return runGenerationJob(userId, job.module, dna, prompt, {
        assetKey: job.assetKey,
        projectId: resolvedProjectId,
        parentJobId: job.id,
        width: job.width,
        height: job.height,
        mimeType: job.mimeType,
        transparentBackground: job.transparentBackground,
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
      changeRequest: safeRequest,
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
    cr.fileIdAfter = newJob.fileId;
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
  const sign = async (fileId?: string, fallback?: string) => {
    if (!fileId) return fallback;
    try {
      const issued = await issueFileDownloadUrl(fileId, userId);
      return issued?.downloadUrl || fallback;
    } catch {
      return fallback;
    }
  };
  return {
    before: await sign(cr.fileIdBefore, cr.imageUrlBefore),
    after: await sign(cr.fileIdAfter, cr.imageUrlAfter),
    request: cr.request,
    status: cr.status,
  };
}
