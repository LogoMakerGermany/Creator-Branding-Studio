import type { CreatorDNA, VideoFormatId, VideoEditPlan, VideoMetadata, VideoScene, VideoPause, AudioActivityBucket, VideoCrop, VideoFitMode, VideoAspectPreset, VideoPreviewState } from '@ucbs/shared';
import { buildDnaPromptContext, getVideoFormatPreset, ffmpegScaleFilter, defaultEditPlan, clipSubtitlesToRange, ffmpegCropScaleFilter, isValidTrim, outputSizeForAspect, buildVideoPreviewState, isSupportedVideoTransition, isValidCaption, sanitizeCaptionText, captionsFromTranscript, MAX_TRANSITION_SEC, DEFAULT_TRANSITION_SEC, CoinSpendCategory } from '@ucbs/shared';
import { dsGet, dsList, dsSet } from '../lib/data-store.js';
import { uploadAssetFromBuffer, uploadAssetFromDataUrl, uploadAssetFromUrl } from '../lib/firebase-storage.js';
import { buildPromptFromDNA, generateImage } from './ai.service.js';
import { generateMusic, generateSpeech, generateVideo, assertMusicDurationSupported, getMusicProviderLimits } from '../lib/media-providers.js';
import {
  analyzeVideoFromSource,
  analyzeVideoLocal,
  transcribeVideoSource,
} from '../lib/video-analysis.js';
import {
  buildSrtContent,
  clipVideoSegment,
  convertMp4ToGif,
  convertMp4ToWebm,
  inferMusicMetadata,
  probeVideoMetadata,
  exportEditedVideo,
} from '../lib/video-processing.js';
import { fetchProviderAudio } from '../lib/safe-provider-fetch.js';
import { randomUUID } from 'node:crypto';
import { ServiceError } from '../lib/errors.js';
import { saveUserFile, getUserFile, issueFileDownloadUrl, mintDownloadUrlForOwnedFile } from './file-cloud.service.js';
import { getProject } from './project.service.js';
import { attachAssetToProject } from './project-assets.service.js';
import { IMAGE_PROVIDER_FAILED_MESSAGE, isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { CAPTIONS_DIRECT_BLOCKED_MESSAGE } from '../lib/provider-gate.js';
import { withCoinCharge } from '../lib/billable-job.js';
import {
  MAX_VIDEO_DURATION_SEC,
  MAX_CONCURRENT_LOCAL_VIDEO_JOBS,
  looksLikePathInjection,
} from '../lib/upload-validation.js';
import { getElevenLabsVoiceId, getMaxConcurrentJobsPerUser } from '../config/env.js';
const COLLECTION = 'mediaJobs';
const VIDEO_COLLECTION = 'videoProjects';

export interface SubtitleEntry {
  start: number;
  end: number;
  text: string;
}

export interface HighlightSegment {
  start: number;
  end: number;
  label: string;
  score: number;
  reason?: string;
  transcriptSegment?: string;
}

export interface MediaJob {
  id: string;
  userId: string;
  type: MediaJobType;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  prompt: string;
  title?: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  thumbnailUrl?: string;
  subtitles?: SubtitleEntry[];
  highlights?: HighlightSegment[];
  duration?: number;
  provider?: string;
  dnaId?: string;
  projectId?: string;
  metadata?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export type MediaJobType =
  | 'video-edit'
  | 'short'
  | 'intro'
  | 'outro'
  | 'stream-start'
  | 'stream-end'
  | 'vtuber-character'
  | 'vtuber-emote'
  | 'vtuber-avatar'
  | 'ai-video'
  | 'ai-music'
  | 'ai-voice'
  | 'stinger'
  | 'alert'
  | 'logo-loop';

export interface VideoProject {
  id: string;
  userId: string;
  title: string;
  sourceUrl?: string;
  sourceFileId?: string;
  duration: number;
  dnaId?: string;
  brandProjectId?: string;
  format?: VideoFormatId;
  metadata?: VideoMetadata;
  editPlan?: VideoEditPlan;
  scenes: VideoScene[];
  pauses: VideoPause[];
  audioActivity: AudioActivityBucket[];
  analyzerVersion?: string;
  subtitles: SubtitleEntry[];
  highlights: HighlightSegment[];
  shorts: MediaJob[];
  renderUrl?: string;
  renderFileId?: string;
  renderJobId?: string;
  srtUrl?: string;
  fileMissing?: boolean;
  captionsNeedReview?: boolean;
  preview?: VideoPreviewState;
  status: 'draft' | 'processing' | 'ready' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export async function listMediaJobs(userId: string, type?: MediaJobType): Promise<MediaJob[]> {
  const jobs = await dsList(COLLECTION, { userId, orderBy: 'createdAt', order: 'desc' });
  return (jobs as unknown as MediaJob[]).filter((j) => !type || j.type === type);
}

export async function getMediaJob(id: string, userId: string): Promise<MediaJob | null> {
  const job = await dsGet(COLLECTION, id);
  if (!job || job.userId !== userId) return null;
  return job as unknown as MediaJob;
}

async function saveMediaJob(job: MediaJob): Promise<void> {
  await dsSet(COLLECTION, job.id, job as unknown as Record<string, unknown>);
}

export async function listVideoProjects(userId: string): Promise<VideoProject[]> {
  const projects = await dsList(VIDEO_COLLECTION, { userId, orderBy: 'updatedAt', order: 'desc' });
  const list = (projects as unknown as VideoProject[]).map(normalizeVideoProject);
  return Promise.all(list.map((p) => hydrateVideoProject(p, userId)));
}

export async function getVideoProject(id: string, userId: string): Promise<VideoProject | null> {
  const p = await dsGet(VIDEO_COLLECTION, id);
  if (!p || p.userId !== userId) return null;
  return hydrateVideoProject(p as unknown as VideoProject, userId);
}

function normalizeVideoProject(p: VideoProject): VideoProject {
  return {
    ...p,
    scenes: p.scenes ?? [],
    pauses: p.pauses ?? [],
    audioActivity: p.audioActivity ?? [],
    subtitles: p.subtitles ?? [],
    highlights: p.highlights ?? [],
    shorts: p.shorts ?? [],
    editPlan: p.editPlan ?? defaultEditPlan(p.duration || 1),
  };
}

export async function hydrateVideoProject(project: VideoProject, userId: string): Promise<VideoProject> {
  const next = normalizeVideoProject(project);
  next.preview = buildVideoPreviewState({
    plan: next.editPlan ?? defaultEditPlan(next.duration || 1),
    captions: next.subtitles,
  });
  if (!next.sourceFileId) return next;
  try {
    const issued = await issueFileDownloadUrl(next.sourceFileId, userId);
    if (!issued) {
      next.fileMissing = true;
      next.sourceUrl = undefined;
      return next;
    }
    next.sourceUrl = issued.downloadUrl;
    next.fileMissing = false;
  } catch {
    next.fileMissing = true;
    next.sourceUrl = undefined;
  }
  return next;
}

async function loadOwnedMediaBuffer(
  userId: string,
  fileId: string,
  kind: 'intro' | 'outro' | 'audio' | 'source'
): Promise<Buffer> {
  if (looksLikePathInjection(fileId) || fileId.includes('/') || fileId.includes('\\')) {
    throw new ServiceError(400, 'INVALID_SOURCE', 'Dateipfade sind nicht erlaubt');
  }
  const file = await getUserFile(fileId, userId);
  if (!file) {
    throw new ServiceError(
      404,
      'NOT_FOUND',
      kind === 'source' ? 'Video nicht gefunden' : `${kind} gehört nicht zu diesem Konto`
    );
  }
  if (file.downloadUrl?.startsWith('data:')) {
    return Buffer.from(file.downloadUrl.split(',')[1] ?? '', 'base64');
  }
  const minted = await mintDownloadUrlForOwnedFile(userId, file);
  if (!minted) throw new ServiceError(410, 'FILE_MISSING', 'Datei nicht verfügbar');
  if (minted.url.startsWith('data:')) {
    return Buffer.from(minted.url.split(',')[1] ?? '', 'base64');
  }
  if (!/^https?:\/\//i.test(minted.url)) {
    throw new ServiceError(400, 'INVALID_SOURCE', 'Dateipfade sind nicht erlaubt');
  }
  const res = await fetch(minted.url);
  if (!res.ok) throw new ServiceError(410, 'FILE_MISSING', 'Datei nicht verfügbar');
  return Buffer.from(await res.arrayBuffer());
}

async function ownedSourceDataUrl(userId: string, project: VideoProject): Promise<string> {
  if (project.sourceFileId) {
    const buf = await loadOwnedMediaBuffer(userId, project.sourceFileId, 'source');
    return `data:video/mp4;base64,${buf.toString('base64')}`;
  }
  if (project.sourceUrl?.startsWith('data:') || project.sourceUrl?.startsWith('http')) {
    return project.sourceUrl;
  }
  throw new ServiceError(400, 'NO_SOURCE', 'Video-Quelle fehlt');
}

async function assertLocalVideoCapacity(userId: string): Promise<void> {
  const cap = getMaxConcurrentJobsPerUser() ?? MAX_CONCURRENT_LOCAL_VIDEO_JOBS;
  const jobs = await listMediaJobs(userId);
  const running = jobs.filter(
    (j) =>
      (j.type === 'short' || j.type === 'video-edit') &&
      (j.status === 'queued' || j.status === 'processing')
  ).length;
  if (running >= cap) {
    throw new ServiceError(429, 'CONCURRENT_JOB_LIMIT', 'Zu viele laufende Video-Exporte. Bitte warten.');
  }
}

function nextExportVersion(project: VideoProject): number {
  const completed = project.shorts.filter((s) => s.status === 'completed').length;
  return completed + (project.renderFileId ? 1 : 0) + 1;
}

function assertExportTrim(start: number, end: number, duration: number): void {
  if (!isValidTrim(start, end, duration)) {
    throw new ServiceError(400, 'INVALID_TRIM', 'Ungültiger Trim: start >= 0, end <= Dauer, start < end');
  }
}

export async function createVideoProject(
  userId: string,
  title: string,
  duration: number,
  format: VideoFormatId = 'shorts',
  dnaId?: string,
  brandProjectId?: string
): Promise<VideoProject> {
  const now = new Date().toISOString();
  const project: VideoProject = {
    id: randomUUID(),
    userId,
    title,
    duration,
    format,
    dnaId,
    brandProjectId,
    subtitles: [],
    highlights: [],
    shorts: [],
    scenes: [],
    pauses: [],
    audioActivity: [],
    editPlan: defaultEditPlan(duration),
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
  await dsSet(VIDEO_COLLECTION, project.id, project as unknown as Record<string, unknown>);
  return project;
}

export async function attachVideoSource(
  projectId: string,
  userId: string,
  dataUrl: string,
  duration?: number,
  fileName?: string
): Promise<VideoProject> {
  const project = await getVideoProject(projectId, userId);
  if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');

  const { parseAndValidateVideoDataUrl } = await import('../lib/upload-validation.js');
  const validated = parseAndValidateVideoDataUrl(dataUrl, { fileName });

  const file = await saveUserFile(userId, {
    name: fileName || `${project.title}.${validated.mimeType === 'video/webm' ? 'webm' : 'mp4'}`,
    mimeType: validated.mimeType,
    category: 'video',
    dataUrl,
    source: 'upload',
    projectId: project.brandProjectId,
  });

  project.sourceFileId = file.id;
  project.sourceUrl = file.downloadUrl;
  try {
    const meta = await probeVideoMetadata(
      file.downloadUrl?.startsWith('data:') ? file.downloadUrl : `data:${validated.mimeType};base64,${validated.buffer.toString('base64')}`
    );
    if (!meta.width || !meta.height || meta.durationSec <= 0) {
      throw new ServiceError(400, 'INVALID_UPLOAD', 'Ungültiges Video — Metadaten konnten nicht gelesen werden');
    }
    if (meta.durationSec > MAX_VIDEO_DURATION_SEC) {
      throw new ServiceError(400, 'FILE_TOO_LARGE', `Maximale Videolänge: ${MAX_VIDEO_DURATION_SEC}s`);
    }
    project.metadata = meta;
    project.duration = meta.durationSec;
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    throw new ServiceError(400, 'INVALID_UPLOAD', 'Ungültiges Video — Analyse fehlgeschlagen');
  }
  void duration;
  project.editPlan = defaultEditPlan(project.duration);
  project.status = 'draft';
  project.updatedAt = new Date().toISOString();
  await dsSet(VIDEO_COLLECTION, project.id, project as unknown as Record<string, unknown>);
  return hydrateVideoProject(project, userId);
}

export async function detectHighlights(
  projectId: string,
  userId: string,
  _styleDirection?: string
): Promise<VideoProject> {
  void _styleDirection;
  return analyzeVideoLocally(projectId, userId);
}

export async function generateSubtitles(projectId: string, userId: string): Promise<VideoProject> {
  const project = await getVideoProject(projectId, userId);
  if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  throw new ServiceError(503, 'AI_NOT_CONFIGURED', CAPTIONS_DIRECT_BLOCKED_MESSAGE);
}

export async function renderVideoProject(projectId: string, userId: string): Promise<VideoProject> {
  const project = await getVideoProject(projectId, userId);
  if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  if (!project.sourceFileId && !project.sourceUrl) throw new ServiceError(400, 'NO_SOURCE', 'Video-Quelle fehlt');
  if (project.fileMissing) throw new ServiceError(410, 'FILE_MISSING', 'Quelldatei fehlt');

  const plan = project.editPlan ?? defaultEditPlan(project.duration);
  assertExportTrim(plan.trimStart, plan.trimEnd, project.duration);
  await assertLocalVideoCapacity(userId);
  const source = await ownedSourceDataUrl(userId, project);
  const introBuffer = plan.introFileId ? await loadOwnedMediaBuffer(userId, plan.introFileId, 'intro') : undefined;
  const outroBuffer = plan.outroFileId ? await loadOwnedMediaBuffer(userId, plan.outroFileId, 'outro') : undefined;
  if (plan.audioFileId) await loadOwnedMediaBuffer(userId, plan.audioFileId, 'audio');

  const version = nextExportVersion(project);
  const job: MediaJob = {
    id: randomUUID(),
    userId,
    type: 'video-edit',
    status: 'processing',
    prompt: `Local export ${plan.aspectRatio} ${plan.trimStart}-${plan.trimEnd}`,
    title: `${project.title} · v${version}`,
    duration: plan.trimEnd - plan.trimStart,
    metadata: {
      projectId,
      format: plan.aspectRatio,
      version,
      local: true,
      start: plan.trimStart,
      end: plan.trimEnd,
    },
    createdAt: new Date().toISOString(),
  };
  await saveMediaJob(job);
  project.status = 'processing';
  project.renderJobId = job.id;
  await dsSet(VIDEO_COLLECTION, project.id, project as unknown as Record<string, unknown>);

  const range = { start: plan.trimStart, end: plan.trimEnd };
  const subs = plan.subtitleTrack ? clipSubtitlesToRange(project.subtitles, range) : [];
  const sized = outputSizeForAspect(plan.aspectRatio);
  try {
    const rendered = await exportEditedVideo(source, plan, {
      subtitles: subs,
      vertical: plan.aspectRatio === '9:16',
      width: sized?.width,
      height: sized?.height,
      introBuffer,
      outroBuffer,
    });
    const dataUrl = `data:video/mp4;base64,${rendered.toString('base64')}`;
    const file = await saveUserFile(userId, {
      name: `${project.title}-v${version}.mp4`,
      mimeType: 'video/mp4',
      category: 'video',
      dataUrl,
      source: 'generation',
      sourceJobId: job.id,
      sourceAssetId: project.id,
      projectId: project.brandProjectId,
    });
    job.videoUrl = file.downloadUrl;
    job.status = 'completed';
    job.provider = 'ffmpeg-local';
    job.completedAt = new Date().toISOString();
    job.metadata = { ...job.metadata, fileId: file.id, version };
    project.renderUrl = file.downloadUrl;
    project.renderFileId = file.id;
    project.status = 'ready';
    if (project.brandProjectId) {
      await attachAssetToProject(userId, project.brandProjectId, {
        name: job.title || project.title,
        type: 'video',
        url: file.downloadUrl || dataUrl,
        jobId: job.id,
        fileId: file.id,
        module: 'video',
        sourceType: 'video',
        sourceId: project.id,
        mimeType: 'video/mp4',
        version,
      }).catch(() => undefined);
    }
  } catch (err) {
    job.status = 'failed';
    job.error = 'Export fehlgeschlagen';
    job.completedAt = new Date().toISOString();
    project.status = 'failed';
    console.error('[video-export]', err instanceof Error ? err.message : err);
  }
  await saveMediaJob(job);
  project.updatedAt = new Date().toISOString();
  await dsSet(VIDEO_COLLECTION, project.id, project as unknown as Record<string, unknown>);
  return hydrateVideoProject(project, userId);
}

export async function analyzeVideoProject(
  projectId: string,
  userId: string,
  styleDirection?: string
): Promise<VideoProject> {
  const project = await getVideoProject(projectId, userId);
  if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  if (!project.sourceUrl) throw new ServiceError(400, 'NO_SOURCE', 'Video-Quelle fehlt');

  const analysis = await analyzeVideoFromSource(
    project.sourceUrl,
    project.title,
    project.duration,
    styleDirection
  );
  project.subtitles = analysis.subtitles;
  project.highlights = analysis.highlights;
  project.scenes = analysis.scenes;
  project.pauses = analysis.pauses;
  project.audioActivity = analysis.audioActivity;
  project.analyzerVersion = analysis.analyzerVersion;
  const srt = buildSrtContent(project.subtitles);
  project.srtUrl = await uploadAssetFromDataUrl(userId, `data:text/plain;base64,${Buffer.from(srt).toString('base64')}`, {
    folder: 'video-exports',
    fileName: `${projectId}.srt`,
  });
  project.status = 'processing';
  project.updatedAt = new Date().toISOString();
  await dsSet(VIDEO_COLLECTION, project.id, project as unknown as Record<string, unknown>);
  return project;
}

export async function createShortFromHighlight(
  projectId: string,
  userId: string,
  highlightIndex: number,
  dna: CreatorDNA,
  formatOverride?: VideoFormatId,
  crop?: VideoCrop
): Promise<MediaJob> {
  const project = await getVideoProject(projectId, userId);
  if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  if (!project.sourceUrl) throw new ServiceError(400, 'NO_SOURCE', 'Video-Quelle fehlt — Shorts benötigen ein hochgeladenes Video');
  const highlight = project.highlights[highlightIndex];
  if (!highlight) throw new ServiceError(404, 'NOT_FOUND', 'Highlight nicht gefunden');

  const format = getVideoFormatPreset(formatOverride ?? project.format ?? 'shorts');
  const clipEnd = Math.min(highlight.end, highlight.start + format.maxDurationSec);
  const dnaCtx = buildDnaPromptContext(dna);
  const title = `${dna.name} · ${format.label} · ${highlight.label}`;

  const job: MediaJob = {
    id: randomUUID(),
    userId,
    type: 'short',
    status: 'processing',
    prompt: `${format.label} clip (${format.aspectRatio}). Highlight: ${highlight.label}. ${dnaCtx}`,
    title,
    duration: clipEnd - highlight.start,
    dnaId: dna.id,
    metadata: {
      projectId,
      highlightIndex,
      start: highlight.start,
      end: clipEnd,
      clipped: true,
      format: format.id,
      aspectRatio: format.aspectRatio,
      width: format.width,
      height: format.height,
      styleDirection: dna.styleDirection,
      platforms: dna.platformOptimization.map((p) => p.platform),
    },
    createdAt: new Date().toISOString(),
  };
  await saveMediaJob(job);

  try {
    const scaleFilter =
      crop
        ? ffmpegCropScaleFilter(format.width, format.height, crop)
        : ffmpegScaleFilter(format);
    const clipBuffer = await clipVideoSegment(project.sourceUrl, highlight.start, clipEnd, {
      vertical: format.vertical,
      scaleFilter,
    });
    job.videoUrl = await uploadAssetFromDataUrl(
      userId,
      `data:video/mp4;base64,${clipBuffer.toString('base64')}`,
      { folder: 'videos', fileName: `${job.id}-${format.id}.mp4` }
    );
    job.provider = `ffmpeg-${format.id}`;
    job.thumbnailUrl = job.videoUrl;
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
  } catch (err) {
    job.status = 'failed';
    job.error = err instanceof Error ? err.message : 'Clip fehlgeschlagen';
    job.completedAt = new Date().toISOString();
  }

  await saveMediaJob(job);
  project.shorts.push(job);
  project.updatedAt = new Date().toISOString();
  await dsSet(VIDEO_COLLECTION, project.id, project as unknown as Record<string, unknown>);
  return job;
}

export async function saveEditPlan(
  projectId: string,
  userId: string,
  plan: VideoEditPlan
): Promise<VideoProject> {
  const project = await getVideoProject(projectId, userId);
  if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  const duration = project.duration || 1;
  assertExportTrim(plan.trimStart, plan.trimEnd, duration);
  if (plan.introFileId) await loadOwnedMediaBuffer(userId, plan.introFileId, 'intro');
  if (plan.outroFileId) await loadOwnedMediaBuffer(userId, plan.outroFileId, 'outro');
  if (plan.audioFileId) await loadOwnedMediaBuffer(userId, plan.audioFileId, 'audio');
  if (plan.transition != null && !isSupportedVideoTransition(String(plan.transition))) {
    throw new ServiceError(400, 'INVALID_TRANSITION', 'Dieser Übergang wird nicht unterstützt');
  }
  if (
    plan.transitionSec != null &&
    (!Number.isFinite(plan.transitionSec) || plan.transitionSec < 0.05 || plan.transitionSec > MAX_TRANSITION_SEC)
  ) {
    throw new ServiceError(400, 'INVALID_TRANSITION', 'Ungültige Übergangsdauer');
  }
  const aspect = (['16:9', '9:16', '1:1', 'original'] as VideoAspectPreset[]).includes(plan.aspectRatio)
    ? plan.aspectRatio
    : 'original';
  const fitMode: VideoFitMode =
    plan.fitMode === 'fit' || plan.fitMode === 'center' || plan.fitMode === 'crop' ? plan.fitMode : 'crop';
  project.editPlan = {
    ...defaultEditPlan(duration),
    ...plan,
    trimStart: plan.trimStart,
    trimEnd: plan.trimEnd,
    volume: Math.max(0, Math.min(2, plan.volume ?? 1)),
    mute: Boolean(plan.mute) || (plan.volume ?? 1) <= 0,
    removeSegments: plan.removeSegments ?? [],
    crop: plan.crop ?? project.editPlan?.crop ?? defaultEditPlan(duration).crop,
    fitMode,
    aspectRatio: aspect,
    subtitleTrack: Boolean(plan.subtitleTrack),
    introFileId: plan.introFileId || null,
    outroFileId: plan.outroFileId || null,
    audioFileId: plan.audioFileId || null,
    transition: plan.transition === 'fade' ? 'fade' : 'cut',
    transitionSec: plan.transitionSec ?? DEFAULT_TRANSITION_SEC,
  };
  project.updatedAt = new Date().toISOString();
  await dsSet(VIDEO_COLLECTION, project.id, project as unknown as Record<string, unknown>);
  return hydrateVideoProject(project, userId);
}

export async function analyzeVideoLocally(projectId: string, userId: string): Promise<VideoProject> {
  const project = await getVideoProject(projectId, userId);
  if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  if (!project.sourceFileId && !project.sourceUrl) throw new ServiceError(400, 'NO_SOURCE', 'Video-Quelle fehlt');
  if (project.fileMissing) throw new ServiceError(410, 'FILE_MISSING', 'Quelldatei fehlt');
  const source = await ownedSourceDataUrl(userId, project);
  const analysis = await analyzeVideoLocal(source, project.duration, project.subtitles);
  project.scenes = analysis.scenes;
  project.pauses = analysis.pauses;
  project.audioActivity = analysis.audioActivity;
  project.highlights = analysis.highlights;
  project.analyzerVersion = analysis.analyzerVersion;
  project.updatedAt = new Date().toISOString();
  await dsSet(VIDEO_COLLECTION, project.id, project as unknown as Record<string, unknown>);
  return hydrateVideoProject(project, userId);
}

const MAX_CAPTIONS = 80;

export async function saveSubtitleEdits(
  projectId: string,
  userId: string,
  subtitles: SubtitleEntry[]
): Promise<VideoProject> {
  const project = await getVideoProject(projectId, userId);
  if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  if (subtitles.length > MAX_CAPTIONS) {
    throw new ServiceError(400, 'INVALID_CAPTION', `Maximal ${MAX_CAPTIONS} Captions`);
  }
  const duration = project.duration || 0;
  const next: SubtitleEntry[] = [];
  for (const s of subtitles) {
    const entry = {
      start: s.start,
      end: s.end,
      text: sanitizeCaptionText(s.text),
    };
    if (!isValidCaption(entry, duration)) {
      throw new ServiceError(400, 'INVALID_CAPTION', 'Ungültiges Caption-Timing oder Text');
    }
    next.push(entry);
  }
  project.subtitles = next;
  project.captionsNeedReview = false;
  const srt = buildSrtContent(project.subtitles);
  project.srtUrl = await uploadAssetFromDataUrl(
    userId,
    `data:text/plain;base64,${Buffer.from(srt).toString('base64')}`,
    { folder: 'video-exports', fileName: `${projectId}.srt` }
  );
  project.updatedAt = new Date().toISOString();
  await dsSet(VIDEO_COLLECTION, project.id, project as unknown as Record<string, unknown>);
  return hydrateVideoProject(project, userId);
}

let captionTestTranscript: Array<{ start: number; end: number; text: string }> | undefined;

export function setCaptionTestHooks(hooks: { transcript?: Array<{ start: number; end: number; text: string }> } | null): void {
  captionTestTranscript = hooks?.transcript;
}

export async function executeQuotedCaptions(
  userId: string,
  videoProjectId: string,
  options?: { quoteId?: string }
): Promise<{ job: MediaJob; project: VideoProject; coinsSpent: number; newBalance: number }> {
  const project = await getVideoProject(videoProjectId, userId);
  if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  if (!project.sourceFileId && !project.sourceUrl) throw new ServiceError(400, 'NO_SOURCE', 'Video-Quelle fehlt');

  if (isPaidProviderTestBlocked() && !captionTestTranscript) {
    throw new ServiceError(
      503,
      'AI_NOT_CONFIGURED',
      'Automatische Untertitel sind provider-gated. Bestätigung allein startet keinen Provider.'
    );
  }

  const result = await withCoinCharge(
    userId,
    CoinSpendCategory.VIDEO_EDIT,
    'Automatische Video-Captions (Review)',
    async () => {
      const segments =
        isPaidProviderTestBlocked() && captionTestTranscript
          ? captionTestTranscript
          : await transcribeVideoSource(project.sourceUrl!);
      const mapped = captionsFromTranscript(segments, project.duration);
      project.subtitles = mapped;
      project.captionsNeedReview = true;
      if (project.editPlan) project.editPlan.subtitleTrack = false;
      const srt = buildSrtContent(project.subtitles);
      project.srtUrl = await uploadAssetFromDataUrl(
        userId,
        `data:text/plain;base64,${Buffer.from(srt).toString('base64')}`,
        { folder: 'video-exports', fileName: `${project.id}.srt` }
      );
      const job: MediaJob = {
        id: randomUUID(),
        userId,
        type: 'video-edit',
        status: 'completed',
        prompt: 'captions-review',
        title: 'Captions zur Prüfung',
        subtitles: mapped,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        metadata: { reviewRequired: true, provider: isPaidProviderTestBlocked() ? 'mock' : 'whisper' },
      };
      project.updatedAt = new Date().toISOString();
      await dsSet(VIDEO_COLLECTION, project.id, project as unknown as Record<string, unknown>);
      await saveMediaJob(job);
      return job;
    },
    { quoteId: options?.quoteId }
  );

  const hydrated = await getVideoProject(videoProjectId, userId);
  return {
    job: result.job,
    project: hydrated ?? project,
    coinsSpent: result.coinsSpent,
    newBalance: result.newBalance,
  };
}

export async function exportShortClip(
  projectId: string,
  userId: string,
  input: {
    start: number;
    end: number;
    crop?: VideoCrop;
    format?: VideoFormatId;
    burnSubtitles?: boolean;
    fitMode?: VideoFitMode;
  }
): Promise<MediaJob> {
  const project = await getVideoProject(projectId, userId);
  if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  if (!project.sourceFileId && !project.sourceUrl) throw new ServiceError(400, 'NO_SOURCE', 'Video-Quelle fehlt');
  if (project.fileMissing) throw new ServiceError(410, 'FILE_MISSING', 'Quelldatei fehlt');
  assertExportTrim(input.start, input.end, project.duration);
  await assertLocalVideoCapacity(userId);
  const format = getVideoFormatPreset(input.format ?? 'shorts');
  const start = input.start;
  const end = Math.min(input.end, start + format.maxDurationSec);
  if (!isValidTrim(start, end, project.duration)) {
    throw new ServiceError(400, 'INVALID_TRIM', 'Ungültiger Trim für diesen Clip');
  }
  const crop = input.crop ?? project.editPlan?.crop;
  const aspect: VideoAspectPreset = format.aspectRatio === '4:5' ? '9:16' : format.aspectRatio;
  const plan: VideoEditPlan = {
    trimStart: start,
    trimEnd: end,
    removeSegments: [],
    volume: project.editPlan?.volume ?? 1,
    mute: project.editPlan?.mute,
    crop: crop ?? { mode: 'center', x: 0, y: 0, width: 1, height: 1 },
    fitMode: input.fitMode ?? project.editPlan?.fitMode ?? 'crop',
    aspectRatio: aspect === '1:1' || aspect === '16:9' || aspect === '9:16' ? aspect : '9:16',
    subtitleTrack: Boolean(input.burnSubtitles && project.subtitles.length),
    introFileId: project.editPlan?.introFileId,
    outroFileId: project.editPlan?.outroFileId,
    audioFileId: project.editPlan?.audioFileId,
    transition: project.editPlan?.transition,
  };
  const introBuffer = plan.introFileId ? await loadOwnedMediaBuffer(userId, plan.introFileId, 'intro') : undefined;
  const outroBuffer = plan.outroFileId ? await loadOwnedMediaBuffer(userId, plan.outroFileId, 'outro') : undefined;
  if (plan.audioFileId) await loadOwnedMediaBuffer(userId, plan.audioFileId, 'audio');
  const range = { start, end };
  const version = nextExportVersion(project);
  const job: MediaJob = {
    id: randomUUID(),
    userId,
    type: 'short',
    status: 'processing',
    prompt: `Local ${format.label} ${start.toFixed(1)}-${end.toFixed(1)}`,
    title: `${project.title} · Short v${version}`,
    duration: end - start,
    metadata: {
      projectId,
      start,
      end,
      format: format.id,
      aspectRatio: format.aspectRatio,
      width: format.width,
      height: format.height,
      local: true,
      version,
    },
    createdAt: new Date().toISOString(),
  };
  await saveMediaJob(job);
  try {
    const source = await ownedSourceDataUrl(userId, project);
    const buf = await exportEditedVideo(source, plan, {
      subtitles: plan.subtitleTrack ? clipSubtitlesToRange(project.subtitles, range) : [],
      vertical: format.vertical,
      width: format.width,
      height: format.height,
      introBuffer,
      outroBuffer,
    });
    const dataUrl = `data:video/mp4;base64,${buf.toString('base64')}`;
    const file = await saveUserFile(userId, {
      name: `${project.title}-short-v${version}.mp4`,
      mimeType: 'video/mp4',
      category: 'video',
      dataUrl,
      source: 'generation',
      sourceJobId: job.id,
      sourceAssetId: project.id,
      projectId: project.brandProjectId,
    });
    job.videoUrl = file.downloadUrl;
    job.provider = `ffmpeg-${format.id}`;
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.metadata = { ...job.metadata, fileId: file.id, version };
    if (project.brandProjectId) {
      await attachAssetToProject(userId, project.brandProjectId, {
        name: job.title || 'Short',
        type: 'short',
        url: file.downloadUrl || dataUrl,
        jobId: job.id,
        fileId: file.id,
        module: 'short',
        sourceType: 'video',
        sourceId: project.id,
        mimeType: 'video/mp4',
        version,
      }).catch(() => undefined);
    }
  } catch (err) {
    job.status = 'failed';
    job.error = 'Short-Export fehlgeschlagen';
    job.completedAt = new Date().toISOString();
    console.error('[short-export]', err instanceof Error ? err.message : err);
  }
  await saveMediaJob(job);
  project.shorts.push(job);
  project.updatedAt = new Date().toISOString();
  await dsSet(VIDEO_COLLECTION, project.id, project as unknown as Record<string, unknown>);
  return job;
}

export async function saveVideoOutputToFiles(userId: string, projectId: string, jobId?: string) {
  const video = await getVideoProject(projectId, userId);
  if (!video) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  let url: string | undefined;
  let name = `${video.title}.mp4`;
  if (jobId) {
    const job = video.shorts.find((s) => s.id === jobId) ?? (await getMediaJob(jobId, userId));
    if (!job || job.userId !== userId || !job.videoUrl) {
      throw new ServiceError(404, 'NOT_FOUND', 'Clip nicht gefunden');
    }
    url = job.videoUrl;
    name = `${job.title || 'short'}.mp4`;
  } else {
    url = video.renderUrl || video.shorts[0]?.videoUrl;
    if (!url) throw new ServiceError(404, 'NOT_FOUND', 'Kein Export vorhanden');
  }
  if (url.startsWith('data:')) {
    return saveUserFile(userId, {
      name,
      mimeType: 'video/mp4',
      category: 'video',
      dataUrl: url,
      source: 'generation',
    });
  }
  const res = await fetch(url);
  if (!res.ok) throw new ServiceError(502, 'VIDEO_FETCH_FAILED', 'Export konnte nicht geladen werden');
  const buf = Buffer.from(await res.arrayBuffer());
  return saveUserFile(userId, {
    name,
    mimeType: 'video/mp4',
    category: 'video',
    dataUrl: `data:video/mp4;base64,${buf.toString('base64')}`,
    source: 'generation',
  });
}

export async function saveMediaOutputToFiles(userId: string, jobId: string) {
  const job = await getMediaJob(jobId, userId);
  if (!job?.videoUrl && !job?.imageUrl) throw new ServiceError(404, 'NOT_FOUND', 'Job nicht gefunden');
  const url = job.videoUrl || job.imageUrl!;
  const dataUrl = url.startsWith('data:') ? url : `data:video/mp4;base64,`;
  if (!url.startsWith('data:')) {
    return saveUserFile(userId, {
      name: job.title || job.type,
      mimeType: job.videoUrl ? 'video/mp4' : 'image/png',
      category: job.videoUrl ? 'video' : 'other',
      dataUrl: url,
      source: 'generation',
    }).catch(async () => {
      const res = await fetch(url);
      const buf = Buffer.from(await res.arrayBuffer());
      const mime = job.videoUrl ? 'video/mp4' : 'image/png';
      return saveUserFile(userId, {
        name: job.title || job.type,
        mimeType: mime,
        category: job.videoUrl ? 'video' : 'other',
        dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
        source: 'generation',
      });
    });
  }
  return saveUserFile(userId, {
    name: job.title || job.type,
    mimeType: dataUrl.includes('video') ? 'video/mp4' : 'image/png',
    category: 'video',
    dataUrl,
    source: 'generation',
  });
}

export async function saveVideoRenderToProject(userId: string, projectId: string, brandProjectId: string) {
  const video = await getVideoProject(projectId, userId);
  if (!video?.renderUrl && !video?.shorts[0]?.videoUrl) {
    throw new ServiceError(404, 'NOT_FOUND', 'Kein Export vorhanden');
  }
  const url = video.renderUrl || video.shorts[0]!.videoUrl!;
  const isShort = !video.renderUrl && Boolean(video.shorts[0]?.videoUrl);
  const asset = await attachAssetToProject(userId, brandProjectId, {
    name: video.title,
    type: isShort ? 'short' : 'video',
    url,
    module: isShort ? 'short' : 'video',
    sourceType: 'video',
    sourceId: video.id,
    mimeType: 'video/mp4',
  });
  const project = await getProject(brandProjectId, userId);
  if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  return { project, asset };
}

export async function runMediaJob(
  userId: string,
  type: MediaJobType,
  dna: CreatorDNA,
  options?: {
    customPrompt?: string;
    title?: string;
    duration?: number;
    metadata?: Record<string, unknown>;
    projectId?: string;
  }
): Promise<MediaJob> {
  const dnaCtx = buildDnaPromptContext(dna);
  const prompts: Record<string, string> = {
    intro: `Epic stream intro animation for ${dna.name}, ${dna.styleDirection} style, logo reveal, dynamic. ${dnaCtx}`,
    outro: `Stream outro/end screen for ${dna.name}, ${dna.styleDirection}, subscribe reminder, branded. ${dnaCtx}`,
    stinger: `Short 1-3s branded stinger/transition slam for ${dna.name}, ${dna.styleDirection}. Keep the logo recognizable. ${dnaCtx}`,
    alert: `Animated stream alert burst for ${dna.name}, ${dna.styleDirection}, readable text-safe center. ${dnaCtx}`,
    'logo-loop': `Seamless looping background animation, logo of ${dna.name} stays centered and unchanged, particles/motion around it, ${dna.styleDirection}. ${dnaCtx}`,
    'stream-start': `Starting soon screen for ${dna.name}, ${dna.styleDirection} gaming stream. ${dnaCtx}`,
    'stream-end': `Stream ending thank you screen for ${dna.name}, ${dna.styleDirection}. ${dnaCtx}`,
    'vtuber-character': `VTuber anime character full body${dna.mascot ? ` inspired by ${dna.mascot}` : ''}, ${dna.styleDirection}. ${dnaCtx}`,
    'vtuber-emote': `VTuber emote expression pack style, ${dna.styleDirection}, cute chibi. ${dnaCtx}`,
    'vtuber-avatar': `VTuber avatar portrait, anime style, ${dna.styleDirection}. ${dnaCtx}`,
    'ai-video': `Social media promotional video, ${dna.styleDirection}. ${dnaCtx}`,
    short: `Vertical 9:16 short video, ${dna.styleDirection}, dynamic. ${dnaCtx}`,
    'video-edit': `Video edit preview, ${dna.styleDirection}. ${dnaCtx}`,
    'ai-music': `Background music for ${dna.styleDirection} stream. ${dnaCtx}`,
    'ai-voice': `Stream intro voiceover for ${dna.name}. ${dnaCtx}`,
  };

  const job: MediaJob = {
    id: randomUUID(),
    userId,
    type,
    status: 'processing',
    prompt:
      options?.customPrompt ||
      buildPromptFromDNA(dna, 'ai-image', prompts[type]),
    title: options?.title || type,
    duration: options?.duration,
    dnaId: dna.id,
    projectId: options?.projectId,
    metadata: options?.metadata,
    createdAt: new Date().toISOString(),
  };

  await saveMediaJob(job);

  try {
    if (type === 'ai-music') {
      const limits = getMusicProviderLimits();
      if (!limits.ok) {
        throw new ServiceError(503, limits.code, limits.message);
      }
      const duration = assertMusicDurationSupported(options?.duration ?? limits.maxDurationSec);
      const music = await generateMusic(job.prompt, {
        duration,
        title: options?.title || `${dna.styleDirection} Stream Music`,
      });
      job.audioUrl = await persistAudio(userId, music.audioUrl);
      job.provider = music.provider;
      job.duration = music.duration;
      job.title = options?.title || `${dna.styleDirection} Stream Music`;
      const musicMeta = inferMusicMetadata(job.prompt);
      job.metadata = {
        ...job.metadata,
        genre: musicMeta.genre,
        bpm: musicMeta.bpm,
        providerNote: music.provider.includes('replicate') ? 'MusicGen' : 'Suno',
      };
      job.status = 'completed';
    } else if (type === 'ai-voice') {
      const script = options?.customPrompt || generateVoiceScript(dna);
      const speech = await generateSpeech(script);
      job.audioUrl = await persistAudio(userId, speech.audioUrl);
      job.provider = speech.provider;
      job.metadata = {
        ...job.metadata,
        transcript: script,
        voice: getElevenLabsVoiceId(),
      };
      job.status = 'completed';
    } else if (
      type === 'ai-video' ||
      type === 'short' ||
      type.startsWith('stream') ||
      type === 'intro' ||
      type === 'outro' ||
      type === 'stinger' ||
      type === 'alert' ||
      type === 'logo-loop'
    ) {
      const aspectRatio =
        options?.metadata?.aspectRatio === '9:16' || options?.metadata?.aspectRatio === '16:9'
          ? (options.metadata.aspectRatio as '9:16' | '16:9')
          : type === 'short' || type === 'alert'
            ? '9:16'
            : '16:9';
      const video = await generateVideo(job.prompt, {
        aspectRatio,
        duration: options?.duration || (type === 'stinger' || type === 'alert' || type === 'logo-loop' ? 4 : type === 'intro' || type === 'outro' ? 6 : 10),
        imageUrl: typeof options?.metadata?.logoUrl === 'string' ? options.metadata.logoUrl : undefined,
      });
      job.videoUrl = await persistVideo(userId, video.videoUrl);
      job.provider = video.provider;
      job.duration = options?.duration || (type === 'intro' || type === 'outro' ? 6 : 10);
      job.metadata = { ...job.metadata, format: aspectRatio };

      const mp4Buffer = await fetchVideoBufferForExport(job.videoUrl);
      const exports: Record<string, string> = { mp4: job.videoUrl };
      try {
        const gifBuffer = await convertMp4ToGif(mp4Buffer);
        exports.gif = await uploadAssetFromDataUrl(
          userId,
          `data:image/gif;base64,${gifBuffer.toString('base64')}`,
          { folder: 'videos', fileName: `${job.id}.gif` }
        );
      } catch (err) {
        console.warn('[Media] GIF export failed:', err instanceof Error ? err.message : 'error');
      }
      try {
        const webmBuffer = await convertMp4ToWebm(mp4Buffer);
        exports.webm = await uploadAssetFromDataUrl(
          userId,
          `data:video/webm;base64,${webmBuffer.toString('base64')}`,
          { folder: 'videos', fileName: `${job.id}.webm` }
        );
      } catch (err) {
        console.warn('[Media] WEBM export failed:', err instanceof Error ? err.message : 'error');
      }
      job.metadata = { ...job.metadata, exports };

      try {
        const thumb = await generateImage({
          module: 'ai-image',
          dna,
          customPrompt: `${job.prompt}, video thumbnail frame`,
          size: type === 'short' ? '1024x1792' : '1792x1024',
        });
        job.thumbnailUrl = await persistGeneratedImage(userId, thumb);
        job.imageUrl = job.thumbnailUrl;
        job.metadata = { ...job.metadata, thumbnailProvider: thumb.provider };
      } catch {
        job.thumbnailUrl = job.videoUrl;
        job.imageUrl = job.videoUrl;
      }

      job.status = 'completed';
    } else if (type.startsWith('vtuber')) {
      const vtuber = await generateImage({
        module: 'ai-image',
        dna,
        customPrompt: job.prompt,
      });
      job.imageUrl = await persistGeneratedImage(userId, vtuber);
      job.thumbnailUrl = job.imageUrl;
      job.provider = vtuber.provider;
      job.status = 'completed';
      job.metadata = { ...job.metadata, exportFormats: ['PNG'] };
    } else {
      const still = await generateImage({
        module: 'ai-image',
        dna,
        customPrompt: job.prompt,
      });
      job.thumbnailUrl = await persistGeneratedImage(userId, still);
      job.provider = still.provider;
      job.status = 'completed';
    }

    job.completedAt = new Date().toISOString();
  } catch (err) {
    job.status = 'failed';
    job.error = err instanceof Error ? err.message : 'Failed';
    job.completedAt = new Date().toISOString();
  }

  if (job.status === 'completed' && job.projectId) {
    const url = job.videoUrl || job.imageUrl;
    if (url) {
      await attachAssetToProject(userId, job.projectId, {
        name: job.title || job.type,
        type: job.type === 'short' ? 'short' : job.type.includes('intro') || job.type === 'outro' || job.type === 'stinger' || job.type === 'logo-loop' || job.type === 'alert' ? 'animation' : 'video',
        url,
        jobId: job.id,
        module: job.type,
        sourceType: job.type === 'short' ? 'video' : 'animation',
        sourceId: job.id,
        mimeType: job.videoUrl ? 'video/mp4' : 'image/png',
      }).catch(() => undefined);
    }
  }

  await saveMediaJob(job);
  return job;
}

async function persistGeneratedImage(
  userId: string,
  generated: { imageUrl?: string; imageBuffer?: Buffer; mimeType?: string }
): Promise<string> {
  if (generated.imageBuffer?.length) {
    return uploadAssetFromBuffer(userId, generated.imageBuffer, {
      folder: 'generations',
      contentType: generated.mimeType || 'image/png',
      extension: 'png',
    });
  }
  if (!generated.imageUrl) {
    throw new ServiceError(502, 'PROVIDER_INVALID_PAYLOAD', IMAGE_PROVIDER_FAILED_MESSAGE);
  }
  return persistImage(userId, generated.imageUrl);
}

async function persistImage(userId: string, url: string): Promise<string> {
  if (url.startsWith('data:')) {
    return uploadAssetFromDataUrl(userId, url, { folder: 'generations' });
  }
  return uploadAssetFromUrl(userId, url, { folder: 'generations' });
}

async function persistVideo(userId: string, url: string): Promise<string> {
  if (url.startsWith('data:')) {
    return uploadAssetFromDataUrl(userId, url, { folder: 'videos', fileName: `${randomUUID()}.mp4` });
  }
  return uploadAssetFromUrl(userId, url, { folder: 'videos', contentType: 'video/mp4' });
}

async function persistAudio(userId: string, url: string): Promise<string> {
  const audio = await fetchProviderAudio(url);
  return uploadAssetFromBuffer(userId, audio.buffer, {
    folder: 'audio',
    fileName: `${randomUUID()}.${audio.extension}`,
    contentType: audio.mimeType,
    extension: audio.extension,
  });
}

function generateVoiceScript(dna: CreatorDNA, custom?: string): string {
  if (custom) return custom;
  return `Willkommen bei ${dna.name}! Bereit für ${dna.styleDirection} Content? Abonniere für mehr!`;
}

async function fetchVideoBufferForExport(videoUrl: string): Promise<Buffer> {
  if (videoUrl.startsWith('data:')) {
    return Buffer.from(videoUrl.split(',')[1] ?? '', 'base64');
  }
  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error('Video für Export konnte nicht geladen werden');
  return Buffer.from(await res.arrayBuffer());
}
