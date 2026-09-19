import { randomUUID } from 'node:crypto';
import { CoinSpendCategory, buildDnaPromptContext, type CreatorDNA } from '@ucbs/shared';
import { withCoinCharge } from '../lib/billable-job.js';
import { ServiceError } from '../lib/errors.js';
import { requireVideoProvider } from '../lib/media-providers.js';
import { mapRunwayDuration } from '../lib/runway-video.js';
import { resolveDnaForRequest } from './dna.service.js';
import { issueFileDownloadUrl, saveUserFile } from './file-cloud.service.js';
import { getMediaJob, listMediaJobs, runMediaJob, type MediaJob } from './media.service.js';
import { AppError } from '../middleware/errorHandler.js';
import { createTinyTestVideo } from '../lib/video-processing.js';

let aiVideoTestHooks: { result?: 'success' | 'fail'; videoDataUrl?: string } | undefined;

export function setAiVideoTestHooks(hooks: typeof aiVideoTestHooks | null): void {
  aiVideoTestHooks = hooks ?? undefined;
}

export async function listAiVideos(userId: string): Promise<MediaJob[]> {
  return listMediaJobs(userId, 'ai-video');
}

export async function getAiVideo(id: string, userId: string): Promise<MediaJob | null> {
  const job = await getMediaJob(id, userId);
  if (!job || job.type !== 'ai-video') return null;
  return job;
}

export async function downloadAiVideo(
  jobId: string,
  userId: string
): Promise<{ downloadUrl: string; expiresAt: string; fileId: string }> {
  const job = await getMediaJob(jobId, userId);
  if (!job || job.type !== 'ai-video') {
    throw new ServiceError(404, 'NOT_FOUND', 'KI-Video nicht gefunden');
  }
  const fileId = typeof job.metadata?.fileId === 'string' ? job.metadata.fileId : undefined;
  if (!fileId) throw new ServiceError(404, 'NOT_FOUND', 'Kein KI-Video-Result gespeichert');
  const issued = await issueFileDownloadUrl(fileId, userId);
  if (!issued) throw new ServiceError(404, 'NOT_FOUND', 'Datei nicht gefunden');
  return { downloadUrl: issued.downloadUrl, expiresAt: issued.expiresAt, fileId };
}

export async function generateAiVideo(
  userId: string,
  projectId: string | undefined,
  payload?: Record<string, unknown>
): Promise<{ job: MediaJob; coinsSpent: number; newBalance: number }> {
  const { dna } = await resolveDnaForRequest(userId, projectId);
  if (!dna) throw new ServiceError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');

  const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
  const title =
    typeof payload?.title === 'string' && payload.title.trim()
      ? payload.title.trim()
      : `${dna.name} KI-Video`;
  const customPrompt =
    typeof payload?.prompt === 'string' && payload.prompt.trim()
      ? payload.prompt.trim()
      : message.replace(/^(erstell(?:e)? (mir )?ein( )?ki[- ]?video:?\s*)/i, '').trim() || message;
  const durationRaw = payload?.duration;
  const duration =
    typeof durationRaw === 'number' && Number.isFinite(durationRaw)
      ? mapRunwayDuration(Number.isInteger(durationRaw) ? durationRaw : Math.round(durationRaw))
      : 8;
  const dnaCtx = buildDnaPromptContext(dna);
  const prompt = [customPrompt || `Social promotional video for ${dna.name}`, dnaCtx].filter(Boolean).join('. ');
  const quoteId = typeof payload?.quoteId === 'string' ? payload.quoteId : undefined;

  if (!aiVideoTestHooks) {
    requireVideoProvider();
  }

  try {
    return await withCoinCharge(
      userId,
      CoinSpendCategory.AI_VIDEO,
      'KI-Video',
      async () => {
        if (aiVideoTestHooks?.result === 'fail') {
          const job: MediaJob = {
            id: randomUUID(),
            userId,
            type: 'ai-video',
            status: 'failed',
            prompt,
            title,
            duration,
            dnaId: dna.id,
            projectId,
            error: 'mock-fail',
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            metadata: { quoteId: quoteId ?? null, source: 'ai-video' },
          };
          const { dsSet } = await import('../lib/data-store.js');
          await dsSet('mediaJobs', job.id, job as unknown as Record<string, unknown>);
          return job;
        }

        if (aiVideoTestHooks?.result === 'success') {
          const dataUrl =
            aiVideoTestHooks.videoDataUrl ??
            `data:video/mp4;base64,${(await createTinyTestVideo(Math.min(2.2, duration))).toString('base64')}`;
          return persistMockAiVideoResult(userId, dna, prompt, title, duration, projectId, dataUrl, quoteId);
        }

        return runMediaJob(userId, 'ai-video', dna, {
          customPrompt: prompt,
          title,
          duration,
          projectId,
          metadata: {
            quoteId: quoteId ?? null,
            source: 'ai-video',
            aspectRatio: '16:9',
          },
        });
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

async function persistMockAiVideoResult(
  userId: string,
  dna: CreatorDNA,
  prompt: string,
  title: string,
  duration: number,
  projectId: string | undefined,
  dataUrl: string,
  quoteId?: string
): Promise<MediaJob> {
  const id = randomUUID();
  const file = await saveUserFile(userId, {
    name: title,
    mimeType: 'video/mp4',
    category: 'video',
    dataUrl,
    source: 'generation',
    projectId,
    sourceJobId: id,
  });
  const job: MediaJob = {
    id,
    userId,
    type: 'ai-video',
    status: 'completed',
    prompt,
    title,
    duration,
    dnaId: dna.id,
    projectId,
    provider: 'mock',
    videoUrl: file.downloadUrl,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    metadata: {
      fileId: file.id,
      quoteId: quoteId ?? null,
      source: 'ai-video',
      outputFormat: 'mp4',
      format: '16:9',
    },
  };
  const { dsSet } = await import('../lib/data-store.js');
  await dsSet('mediaJobs', job.id, job as unknown as Record<string, unknown>);
  return job;
}
