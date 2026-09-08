import { randomUUID } from 'node:crypto';
import {
  CoinSpendCategory,
  applyMusicChangeRequest,
  buildMusicPreviewSummary,
  checkMusicDuration,
  defaultMusicConfig,
  musicDownloadFilename,
  musicGenMaxDurationSec,
  parseMusicIntent,
  sanitizeMusicUserRequest,
  settingsToMusicConfig,
  type CreatorDNA,
  type MusicConfig,
} from '@ucbs/shared';
import { withCoinCharge } from '../lib/billable-job.js';
import { ServiceError } from '../lib/errors.js';
import { generateMusic, getMusicProviderLimits, isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { createTinyTestAudio } from '../lib/audio-test.js';
import { AppError } from '../middleware/errorHandler.js';
import { resolveDnaForRequest } from './dna.service.js';
import {
  issueFileDownloadUrl,
  listUserFiles,
  saveUserFile,
  type UserFile,
} from './file-cloud.service.js';
import { getMediaJob, listMediaJobs, type MediaJob } from './media.service.js';
import { recordJobVersion, getVersionsForJob } from './change-request.service.js';
import { attachAssetToProject } from './project-assets.service.js';

export interface MusicJobView extends MediaJob {
  fileMissing?: boolean;
  config?: MusicConfig;
  downloadName?: string;
}

let musicTestHooks: { result?: 'success' | 'fail'; audioDataUrl?: string } | undefined;

export function setMusicTestHooks(hooks: typeof musicTestHooks | null): void {
  musicTestHooks = hooks ?? undefined;
}

function planFromPayload(payload?: Record<string, unknown>): MusicConfig {
  const parsed = parseMusicIntent(typeof payload?.message === 'string' ? payload.message : '');
  const base = defaultMusicConfig();
  const rawDur = payload?.duration ?? payload?.durationSec ?? parsed.duration ?? base.durationSec;
  const durationSec = typeof rawDur === 'number' && Number.isFinite(rawDur) ? rawDur : base.durationSec;
  const check = checkMusicDuration(durationSec, musicGenMaxDurationSec());
  if (!check.ok) {
    throw new ServiceError(400, 'MUSIC_DURATION_UNSUPPORTED', check.message);
  }
  const merged = settingsToMusicConfig(
    {
      ...parsed,
      genre: typeof payload?.genre === 'string' ? payload.genre : parsed.genre,
      mood: typeof payload?.mood === 'string' ? payload.mood : parsed.mood,
      energy:
        payload?.energy === 'low' || payload?.energy === 'high' || payload?.energy === 'medium'
          ? payload.energy
          : parsed.energy,
      purpose:
        typeof payload?.purpose === 'string' ? (payload.purpose as MusicConfig['purpose']) : parsed.purpose,
      theme: typeof payload?.theme === 'string' ? payload.theme : parsed.theme,
      title: typeof payload?.title === 'string' ? payload.title : parsed.title,
      prompt: typeof payload?.prompt === 'string' ? sanitizeMusicUserRequest(String(payload.prompt)) : parsed.prompt,
    },
    durationSec
  );
  if (typeof payload?.prompt === 'string' && payload.prompt.trim()) {
    merged.prompt = sanitizeMusicUserRequest(String(payload.prompt));
  }
  merged.instrumental = true;
  merged.summary = buildMusicPreviewSummary(merged);
  return merged;
}

export async function listMusic(userId: string): Promise<MusicJobView[]> {
  const jobs = await listMediaJobs(userId, 'ai-music');
  return Promise.all(jobs.map((j) => hydrateMusicJob(j, userId)));
}

export async function getMusic(id: string, userId: string): Promise<MusicJobView | null> {
  const job = await getMediaJob(id, userId);
  if (!job || job.type !== 'ai-music') return null;
  return hydrateMusicJob(job, userId);
}

export async function hydrateMusicJob(job: MediaJob, userId: string): Promise<MusicJobView> {
  const config = planFromJob(job);
  const next: MusicJobView = { ...job, config };
  const fileId = typeof job.metadata?.fileId === 'string' ? job.metadata.fileId : undefined;
  const version = typeof job.metadata?.version === 'number' ? job.metadata.version : 1;
  next.downloadName = musicDownloadFilename({
    creatorName: typeof job.metadata?.creatorName === 'string' ? job.metadata.creatorName : 'creator',
    purpose: config.purpose,
    version,
    ext: 'wav',
  });
  if (!fileId) {
    if (job.status === 'completed') next.fileMissing = true;
    return next;
  }
  try {
    const issued = await issueFileDownloadUrl(fileId, userId);
    if (!issued) {
      next.fileMissing = true;
      next.audioUrl = undefined;
      return next;
    }
    next.audioUrl = issued.downloadUrl;
    next.fileMissing = false;
  } catch (err) {
    if (err instanceof ServiceError && err.code === 'FILE_MISSING') {
      next.fileMissing = true;
      next.audioUrl = undefined;
      return next;
    }
    throw err;
  }
  return next;
}

function planFromJob(job: MediaJob): MusicConfig {
  try {
    return planFromPayload({ ...(job.metadata ?? {}), duration: job.duration });
  } catch {
    return defaultMusicConfig();
  }
}

export async function downloadMusic(
  jobId: string,
  userId: string
): Promise<{ downloadUrl: string; expiresAt: string; fileId: string; filename: string }> {
  const job = await getMusic(jobId, userId);
  if (!job) throw new ServiceError(404, 'NOT_FOUND', 'Musik nicht gefunden');
  const fileId = typeof job.metadata?.fileId === 'string' ? job.metadata.fileId : undefined;
  if (!fileId) throw new ServiceError(404, 'NOT_FOUND', 'Kein Musik-Result gespeichert');
  const issued = await issueFileDownloadUrl(fileId, userId);
  if (!issued) throw new ServiceError(404, 'NOT_FOUND', 'Datei nicht gefunden');
  return {
    downloadUrl: issued.downloadUrl,
    expiresAt: issued.expiresAt,
    fileId,
    filename: job.downloadName || 'track.wav',
  };
}

export async function listMusicVersions(jobId: string, userId: string) {
  const job = await getMediaJob(jobId, userId);
  if (!job || job.type !== 'ai-music') throw new ServiceError(404, 'NOT_FOUND', 'Musik nicht gefunden');
  const rootId = typeof job.metadata?.parentJobId === 'string' ? job.metadata.parentJobId : jobId;
  const lineage = await getVersionsForJob(rootId, userId);
  return lineage.length ? lineage : getVersionsForJob(jobId, userId);
}

export async function listOwnedMusicFiles(userId: string): Promise<UserFile[]> {
  const files = await listUserFiles(userId);
  return files.filter((f) => f.mimeType.startsWith('audio/'));
}

export async function retryMusicJob(jobId: string, userId: string): Promise<never> {
  const job = await getMediaJob(jobId, userId);
  if (!job || job.type !== 'ai-music') throw new ServiceError(404, 'NOT_FOUND', 'Musik nicht gefunden');
  if (job.status !== 'failed') {
    throw new ServiceError(409, 'JOB_NOT_RETRYABLE', 'Nur fehlgeschlagene Jobs können wiederholt werden');
  }
  throw new ServiceError(
    402,
    'MUSIC_REQUIRES_QUOTE',
    'Nach einem endgültigen Fehlschlag und Refund braucht der nächste Versuch ein neues Angebot.'
  );
}

export async function generateMusicTrack(
  userId: string,
  projectId: string | undefined,
  payload?: Record<string, unknown>
): Promise<{ job: MediaJob; coinsSpent: number; newBalance: number }> {
  const { dna } = await resolveDnaForRequest(userId, projectId);
  if (!dna) throw new ServiceError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');

  let plan = planFromPayload(payload);
  const parentJobId = typeof payload?.parentJobId === 'string' ? payload.parentJobId : undefined;
  if (parentJobId) {
    const parent = await getMediaJob(parentJobId, userId);
    if (!parent || parent.type !== 'ai-music') {
      throw new ServiceError(404, 'NOT_FOUND', 'Ausgangs-Track nicht gefunden');
    }
    const parentPlan = planFromJob(parent);
    const request =
      typeof payload?.request === 'string'
        ? payload.request
        : typeof payload?.message === 'string'
          ? payload.message
          : '';
    plan = applyMusicChangeRequest(parentPlan, request);
  }

  const quoteId = typeof payload?.quoteId === 'string' ? payload.quoteId : undefined;
  const prompt = plan.prompt;

  if (musicTestHooks?.result !== 'success' && musicTestHooks?.result !== 'fail') {
    if (isPaidProviderTestBlocked()) {
      throw new ServiceError(
        503,
        'AI_NOT_CONFIGURED',
        'Musik-Provider ist nicht konfiguriert. Vorschau bleibt die Konfiguration.'
      );
    }
    const limits = getMusicProviderLimits();
    if (!limits.ok) {
      throw new ServiceError(503, limits.code, limits.message);
    }
  }

  try {
    return await withCoinCharge(
      userId,
      CoinSpendCategory.AI_MUSIC,
      'KI Musik Generierung',
      async () => {
        if (musicTestHooks?.result === 'fail') {
          const job: MediaJob = {
            id: randomUUID(),
            userId,
            type: 'ai-music',
            status: 'failed',
            prompt,
            title: plan.title || `${dna.name} Music`,
            duration: plan.durationSec,
            dnaId: dna.id,
            projectId,
            error: 'mock-fail',
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            metadata: { ...plan, creatorName: dna.name },
          };
          const { dsSet } = await import('../lib/data-store.js');
          await dsSet('mediaJobs', job.id, job as unknown as Record<string, unknown>);
          return job;
        }

        if (isPaidProviderTestBlocked() || musicTestHooks?.result === 'success') {
          if (isPaidProviderTestBlocked() && musicTestHooks?.result !== 'success') {
            throw new ServiceError(
              503,
              'AI_NOT_CONFIGURED',
              'Musik-Provider ist nicht konfiguriert. Vorschau bleibt die Konfiguration.'
            );
          }
          const dataUrl =
            musicTestHooks?.audioDataUrl ??
            `data:audio/wav;base64,${createTinyTestAudio().toString('base64')}`;
          return persistMockMusicResult(userId, dna, plan, prompt, projectId, parentJobId, dataUrl);
        }

        const music = await generateMusic(prompt, {
          duration: plan.durationSec,
          title: plan.title || `${dna.name} Music`,
        });
        const dataUrl = music.audioUrl.startsWith('data:')
          ? music.audioUrl
          : await fetchAudioAsDataUrl(music.audioUrl);
        const job = await persistMockMusicResult(userId, dna, plan, prompt, projectId, parentJobId, dataUrl);
        job.provider = music.provider;
        const { dsSet } = await import('../lib/data-store.js');
        await dsSet('mediaJobs', job.id, job as unknown as Record<string, unknown>);
        return job;
      },
      { quoteId }
    );
  } catch (err) {
    if (err instanceof AppError) {
      throw new ServiceError(err.statusCode, err.code, err.message);
    }
    throw err;
  }
}

async function fetchAudioAsDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  throw new ServiceError(503, 'AI_NOT_CONFIGURED', 'Remote-Audio ohne Mock ist in diesem Block nicht erlaubt');
}

async function persistMockMusicResult(
  userId: string,
  dna: CreatorDNA,
  plan: MusicConfig,
  prompt: string,
  projectId: string | undefined,
  parentJobId: string | undefined,
  dataUrl: string
): Promise<MediaJob> {
  const id = randomUUID();
  const rootId = parentJobId || id;
  const existing = await getVersionsForJob(rootId, userId);
  const version = existing.length + 1;
  const filename = musicDownloadFilename({
    creatorName: dna.name,
    purpose: plan.purpose,
    version,
    ext: 'wav',
  });
  const file = await saveUserFile(userId, {
    name: filename,
    mimeType: 'audio/wav',
    category: 'other',
    dataUrl,
    source: 'generation',
    projectId,
    sourceJobId: id,
  });
  const versionRow = await recordJobVersion(userId, rootId, file.id, parentJobId ? 'Variante' : 'Original');
  const job: MediaJob = {
    id,
    userId,
    type: 'ai-music',
    status: 'completed',
    prompt,
    title: plan.title || `${dna.name} ${plan.purpose ?? 'music'}`,
    duration: plan.durationSec,
    dnaId: dna.id,
    projectId,
    provider: 'mock',
    audioUrl: file.downloadUrl,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    metadata: {
      ...plan,
      fileId: file.id,
      version: versionRow.version,
      parentJobId,
      creatorName: dna.name,
      mimeType: 'audio/wav',
      outputFormat: 'wav',
      instrumental: true,
      vocalsCapability: 'instrumental-only',
      downloadName: filename,
    },
  };
  const { dsSet } = await import('../lib/data-store.js');
  await dsSet('mediaJobs', job.id, job as unknown as Record<string, unknown>);
  if (projectId) {
    await attachAssetToProject(userId, projectId, {
      name: filename,
      type: 'audio',
      url: file.downloadUrl || dataUrl,
      jobId: id,
      fileId: file.id,
      module: 'ai-music',
      sourceType: 'generation',
      sourceId: id,
      mimeType: 'audio/wav',
      version: versionRow.version,
    }).catch(() => undefined);
  }
  return job;
}
