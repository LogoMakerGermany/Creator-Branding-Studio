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
import {
  generateMusic,
  requireMusicProvider,
} from '../lib/media-providers.js';
import { createTinyTestAudio } from '../lib/audio-test.js';
import {
  audioExtensionForMime,
  fetchProviderAudio,
  MUSIC_INVALID_AUDIO_CODE,
  MUSIC_INVALID_AUDIO_MESSAGE,
  MUSIC_STORAGE_ERROR_CODE,
  MUSIC_STORAGE_FAILED_MESSAGE,
} from '../lib/safe-provider-fetch.js';
import { omitUndefinedFields } from '../lib/firestore-payload.js';
import { AppError } from '../middleware/errorHandler.js';
import { resolveDnaForRequest } from './dna.service.js';
import {
  issueFileDownloadUrl,
  listUserFiles,
  saveGeneratedAudioFile,
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

let musicTestHooks:
  | {
      result?: 'success' | 'fail';
      audioDataUrl?: string;
      providerOutput?: string;
      persistFail?: boolean;
      jobPersistFail?: boolean;
    }
  | undefined;

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
  const ext =
    typeof job.metadata?.outputFormat === 'string' && job.metadata.outputFormat
      ? String(job.metadata.outputFormat)
      : 'wav';
  next.downloadName = musicDownloadFilename({
    creatorName: typeof job.metadata?.creatorName === 'string' ? job.metadata.creatorName : 'creator',
    purpose: config.purpose,
    version,
    ext,
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
  const rightsSafe =
    typeof payload?.rightsSafePrompt === 'string' && payload.rightsSafePrompt.trim()
      ? `\n${String(payload.rightsSafePrompt).trim()}`
      : '';
  const prompt = `${plan.prompt}${rightsSafe}`;

  if (!musicTestHooks) {
    requireMusicProvider();
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
            metadata: omitUndefinedFields({ ...plan, creatorName: dna.name, quoteId }),
          };
          const { dsSet } = await import('../lib/data-store.js');
          await dsSet('mediaJobs', job.id, job as unknown as Record<string, unknown>);
          return job;
        }

        try {
          const audio = await resolveMusicAudio(plan, prompt);
          if (musicTestHooks?.persistFail) {
            throw new ServiceError(503, MUSIC_STORAGE_ERROR_CODE, MUSIC_STORAGE_FAILED_MESSAGE);
          }
          return await persistOwnedMusicResult(
            userId,
            dna,
            plan,
            prompt,
            projectId,
            parentJobId,
            audio,
            quoteId,
            musicTestHooks?.jobPersistFail
          );
        } catch (err) {
          if (err instanceof ServiceError) {
            throw new AppError(err.statusCode, err.code, err.message);
          }
          throw err;
        }
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

async function resolveMusicAudio(
  plan: MusicConfig,
  prompt: string
): Promise<{ buffer: Buffer; mimeType: string; extension: string; provider: string }> {
  if (musicTestHooks?.providerOutput) {
    const audio = await fetchProviderAudio(musicTestHooks.providerOutput);
    return { ...audio, provider: 'mock-https' };
  }
  if (musicTestHooks?.result === 'success') {
    const dataUrl =
      musicTestHooks.audioDataUrl ?? `data:audio/wav;base64,${createTinyTestAudio().toString('base64')}`;
    const audio = await fetchProviderAudio(dataUrl);
    return { ...audio, provider: 'mock' };
  }

  const music = await generateMusic(prompt, {
    duration: plan.durationSec,
    title: plan.title,
  });
  if (typeof music.audioUrl !== 'string' || !music.audioUrl.trim()) {
    throw new ServiceError(502, MUSIC_INVALID_AUDIO_CODE, MUSIC_INVALID_AUDIO_MESSAGE);
  }
  const audio = await fetchProviderAudio(music.audioUrl);
  return { ...audio, provider: music.provider };
}

async function persistOwnedMusicResult(
  userId: string,
  dna: CreatorDNA,
  plan: MusicConfig,
  prompt: string,
  projectId: string | undefined,
  parentJobId: string | undefined,
  audio: { buffer: Buffer; mimeType: string; extension: string; provider: string },
  quoteId?: string,
  jobPersistFail?: boolean
): Promise<MediaJob> {
  const id = randomUUID();
  const rootId = parentJobId || id;
  const existing = await getVersionsForJob(rootId, userId);
  const version = existing.length + 1;
  const ext = audio.extension || audioExtensionForMime(audio.mimeType);
  const filename = musicDownloadFilename({
    creatorName: dna.name,
    purpose: plan.purpose,
    version,
    ext,
  });
  const file = await saveGeneratedAudioFile(userId, {
    name: filename,
    mimeType: audio.mimeType,
    buffer: audio.buffer,
    projectId,
    sourceJobId: id,
    version,
  });
  if (!file.downloadUrl) {
    throw new ServiceError(503, MUSIC_STORAGE_ERROR_CODE, MUSIC_STORAGE_FAILED_MESSAGE);
  }
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
    provider: audio.provider,
    audioUrl: file.downloadUrl,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    metadata: omitUndefinedFields({
      ...plan,
      fileId: file.id,
      version: versionRow.version,
      parentJobId,
      creatorName: dna.name,
      mimeType: audio.mimeType,
      outputFormat: ext,
      instrumental: true,
      vocalsCapability: 'instrumental-only',
      downloadName: filename,
      quoteId,
    }),
  };
  if (jobPersistFail) {
    throw new ServiceError(503, MUSIC_STORAGE_ERROR_CODE, MUSIC_STORAGE_FAILED_MESSAGE);
  }
  const { dsSet } = await import('../lib/data-store.js');
  await dsSet('mediaJobs', job.id, job as unknown as Record<string, unknown>);
  const ownedUrl = file.downloadUrl;
  if (projectId && ownedUrl) {
    await attachAssetToProject(userId, projectId, {
      name: filename,
      type: 'audio',
      url: ownedUrl,
      jobId: id,
      fileId: file.id,
      module: 'ai-music',
      sourceType: 'generation',
      sourceId: id,
      mimeType: audio.mimeType,
      version: versionRow.version,
    }).catch(() => undefined);
  }
  return job;
}
