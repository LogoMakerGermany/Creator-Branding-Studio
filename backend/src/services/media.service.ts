import type { CreatorDNA, VideoFormatId, VideoEditPlan, VideoMetadata, VideoScene, VideoPause, AudioActivityBucket, VideoCrop } from '@ucbs/shared';
import { buildDnaPromptContext, getVideoFormatPreset, ffmpegScaleFilter, defaultEditPlan, clipSubtitlesToRange, ffmpegCropScaleFilter } from '@ucbs/shared';
import { dsGet, dsList, dsSet } from '../lib/data-store.js';
import { uploadAssetFromDataUrl, uploadAssetFromUrl } from '../lib/firebase-storage.js';
import { buildPromptFromDNA, generateImage } from './ai.service.js';
import { generateMusic, generateSpeech, generateVideo } from '../lib/media-providers.js';
import {
  analyzeVideoFromSource,
  analyzeVideoLocal,
  detectHighlightsFromSubtitles,
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
import { getElevenLabsVoiceId } from '../config/env.js';
import { randomUUID } from 'node:crypto';
import { ServiceError } from '../lib/errors.js';
import { saveUserFile } from './file-cloud.service.js';
import { getProject, updateProject } from './project.service.js';
import { attachAssetToProject } from './project-assets.service.js';
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
  srtUrl?: string;
  status: 'draft' | 'processing' | 'ready';
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
  return (projects as unknown as VideoProject[]).map(normalizeVideoProject);
}

export async function getVideoProject(id: string, userId: string): Promise<VideoProject | null> {
  const p = await dsGet(VIDEO_COLLECTION, id);
  if (!p || p.userId !== userId) return null;
  return normalizeVideoProject(p as unknown as VideoProject);
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

export async function createVideoProject(
  userId: string,
  title: string,
  duration: number,
  format: VideoFormatId = 'shorts',
  dnaId?: string
): Promise<VideoProject> {
  const now = new Date().toISOString();
  const project: VideoProject = {
    id: randomUUID(),
    userId,
    title,
    duration,
    format,
    dnaId,
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
  duration?: number
): Promise<VideoProject> {
  const project = await getVideoProject(projectId, userId);
  if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');

  const { parseAndValidateVideoDataUrl } = await import('../lib/upload-validation.js');
  const validated = parseAndValidateVideoDataUrl(dataUrl);

  const file = await saveUserFile(userId, {
    name: `${project.title}.${validated.mimeType === 'video/webm' ? 'webm' : 'mp4'}`,
    mimeType: validated.mimeType,
    category: 'video',
    dataUrl,
    source: 'upload',
  });

  if (!file.downloadUrl) {
    throw new ServiceError(500, 'UPLOAD_FAILED', 'Video konnte nicht gespeichert werden');
  }
  project.sourceUrl = file.downloadUrl;
  project.sourceFileId = file.id;
  try {
    const meta = await probeVideoMetadata(file.downloadUrl);
    project.metadata = meta;
    if (meta.durationSec > 0) project.duration = Math.min(meta.durationSec, 7200);
  } catch {
    if (duration && duration > 0) {
      project.duration = Math.min(Math.round(duration), 7200);
    }
  }
  project.editPlan = defaultEditPlan(project.duration);
  project.updatedAt = new Date().toISOString();
  await dsSet(VIDEO_COLLECTION, project.id, project as unknown as Record<string, unknown>);
  return project;
}

export async function detectHighlights(
  projectId: string,
  userId: string,
  styleDirection?: string
): Promise<VideoProject> {
  const project = await getVideoProject(projectId, userId);
  if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  if (!project.sourceUrl) throw new ServiceError(400, 'NO_SOURCE', 'Video-Quelle fehlt — zuerst hochladen');

  let subtitles = project.subtitles;
  if (!subtitles.length) {
    subtitles = await transcribeVideoSource(project.sourceUrl);
    project.subtitles = subtitles;
  }

  project.highlights = await detectHighlightsFromSubtitles(
    project.title,
    project.duration,
    subtitles,
    styleDirection
  );
  project.status = 'processing';
  project.updatedAt = new Date().toISOString();
  await dsSet(VIDEO_COLLECTION, project.id, project as unknown as Record<string, unknown>);
  return project;
}

export async function generateSubtitles(projectId: string, userId: string): Promise<VideoProject> {
  const project = await getVideoProject(projectId, userId);
  if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  if (!project.sourceUrl) throw new ServiceError(400, 'NO_SOURCE', 'Video-Quelle fehlt — zuerst hochladen');

  project.subtitles = await transcribeVideoSource(project.sourceUrl);
  const srt = buildSrtContent(project.subtitles);
  project.srtUrl = await uploadAssetFromDataUrl(userId, `data:text/plain;base64,${Buffer.from(srt).toString('base64')}`, {
    folder: 'video-exports',
    fileName: `${projectId}.srt`,
  });
  project.updatedAt = new Date().toISOString();
  await dsSet(VIDEO_COLLECTION, project.id, project as unknown as Record<string, unknown>);
  return project;
}

export async function renderVideoProject(projectId: string, userId: string): Promise<VideoProject> {
  const project = await getVideoProject(projectId, userId);
  if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  if (!project.sourceUrl) throw new ServiceError(400, 'NO_SOURCE', 'Video-Quelle fehlt');

  const plan = project.editPlan ?? defaultEditPlan(project.duration);
  const range = { start: plan.trimStart, end: plan.trimEnd };
  const subs = plan.subtitleTrack ? clipSubtitlesToRange(project.subtitles, range) : [];
  const rendered = await exportEditedVideo(project.sourceUrl, plan, {
    subtitles: subs,
    vertical: plan.aspectRatio === '9:16',
  });
  project.renderUrl = await uploadAssetFromDataUrl(
    userId,
    `data:video/mp4;base64,${rendered.toString('base64')}`,
    { folder: 'video-exports', fileName: `${projectId}-render.mp4` }
  );
  project.status = 'ready';
  project.updatedAt = new Date().toISOString();
  await dsSet(VIDEO_COLLECTION, project.id, project as unknown as Record<string, unknown>);
  return project;
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
  project.editPlan = {
    ...plan,
    trimStart: Math.max(0, Math.min(plan.trimStart, duration)),
    trimEnd: Math.max(plan.trimStart + 0.2, Math.min(plan.trimEnd, duration)),
    volume: Math.max(0, Math.min(2, plan.volume ?? 1)),
    removeSegments: plan.removeSegments ?? [],
    crop: plan.crop ?? project.editPlan?.crop ?? defaultEditPlan(duration).crop,
    aspectRatio: plan.aspectRatio ?? 'original',
    subtitleTrack: Boolean(plan.subtitleTrack),
  };
  project.updatedAt = new Date().toISOString();
  await dsSet(VIDEO_COLLECTION, project.id, project as unknown as Record<string, unknown>);
  return project;
}

export async function analyzeVideoLocally(projectId: string, userId: string): Promise<VideoProject> {
  const project = await getVideoProject(projectId, userId);
  if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  if (!project.sourceUrl) throw new ServiceError(400, 'NO_SOURCE', 'Video-Quelle fehlt');
  const analysis = await analyzeVideoLocal(project.sourceUrl, project.duration, project.subtitles);
  project.scenes = analysis.scenes;
  project.pauses = analysis.pauses;
  project.audioActivity = analysis.audioActivity;
  project.highlights = analysis.highlights;
  project.analyzerVersion = analysis.analyzerVersion;
  project.updatedAt = new Date().toISOString();
  await dsSet(VIDEO_COLLECTION, project.id, project as unknown as Record<string, unknown>);
  return project;
}

export async function saveSubtitleEdits(
  projectId: string,
  userId: string,
  subtitles: SubtitleEntry[]
): Promise<VideoProject> {
  const project = await getVideoProject(projectId, userId);
  if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  project.subtitles = subtitles.map((s) => ({
    start: Math.max(0, s.start),
    end: Math.max(s.start + 0.05, s.end),
    text: String(s.text ?? '').slice(0, 500),
  }));
  const srt = buildSrtContent(project.subtitles);
  project.srtUrl = await uploadAssetFromDataUrl(
    userId,
    `data:text/plain;base64,${Buffer.from(srt).toString('base64')}`,
    { folder: 'video-exports', fileName: `${projectId}.srt` }
  );
  project.updatedAt = new Date().toISOString();
  await dsSet(VIDEO_COLLECTION, project.id, project as unknown as Record<string, unknown>);
  return project;
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
  }
): Promise<MediaJob> {
  const project = await getVideoProject(projectId, userId);
  if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  if (!project.sourceUrl) throw new ServiceError(400, 'NO_SOURCE', 'Video-Quelle fehlt');
  const format = getVideoFormatPreset(input.format ?? 'shorts');
  const start = Math.max(0, input.start);
  const end = Math.min(project.duration, Math.max(start + 0.3, input.end));
  const crop = input.crop ?? project.editPlan?.crop;
  const plan: VideoEditPlan = {
    trimStart: start,
    trimEnd: end,
    removeSegments: [],
    volume: 1,
    crop: crop ?? { mode: 'center', x: 0, y: 0, width: 1, height: 1 },
    aspectRatio: format.vertical ? '9:16' : '16:9',
    subtitleTrack: Boolean(input.burnSubtitles && project.subtitles.length),
  };
  const range = { start, end };
  const job: MediaJob = {
    id: randomUUID(),
    userId,
    type: 'short',
    status: 'processing',
    prompt: `Local ${format.label} ${start.toFixed(1)}-${end.toFixed(1)}`,
    title: `${project.title} · Short`,
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
    },
    createdAt: new Date().toISOString(),
  };
  await saveMediaJob(job);
  try {
    const buf = await exportEditedVideo(project.sourceUrl, plan, {
      subtitles: plan.subtitleTrack ? clipSubtitlesToRange(project.subtitles, range) : [],
      vertical: format.vertical,
      width: format.width,
      height: format.height,
    });
    job.videoUrl = await uploadAssetFromDataUrl(
      userId,
      `data:video/mp4;base64,${buf.toString('base64')}`,
      { folder: 'videos', fileName: `${job.id}-short.mp4` }
    );
    job.provider = `ffmpeg-${format.id}`;
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
  } catch (err) {
    job.status = 'failed';
    job.error = err instanceof Error ? err.message : 'Short-Export fehlgeschlagen';
    job.completedAt = new Date().toISOString();
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
      const music = await generateMusic(job.prompt, {
        duration: options?.duration || 120,
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
        console.warn('[Media] GIF export failed:', err);
      }
      try {
        const webmBuffer = await convertMp4ToWebm(mp4Buffer);
        exports.webm = await uploadAssetFromDataUrl(
          userId,
          `data:video/webm;base64,${webmBuffer.toString('base64')}`,
          { folder: 'videos', fileName: `${job.id}.webm` }
        );
      } catch (err) {
        console.warn('[Media] WEBM export failed:', err);
      }
      job.metadata = { ...job.metadata, exports };

      try {
        const { imageUrl, provider } = await generateImage({
          module: 'ai-image',
          dna,
          customPrompt: `${job.prompt}, video thumbnail frame`,
          size: type === 'short' ? '1024x1792' : '1792x1024',
        });
        job.thumbnailUrl = await persistImage(userId, imageUrl);
        job.imageUrl = job.thumbnailUrl;
        job.metadata = { ...job.metadata, thumbnailProvider: provider };
      } catch {
        job.thumbnailUrl = job.videoUrl;
        job.imageUrl = job.videoUrl;
      }

      job.status = 'completed';
    } else if (type.startsWith('vtuber')) {
      const { imageUrl, provider } = await generateImage({
        module: 'ai-image',
        dna,
        customPrompt: job.prompt,
      });
      job.imageUrl = await persistImage(userId, imageUrl);
      job.thumbnailUrl = job.imageUrl;
      job.provider = provider;
      job.status = 'completed';
      job.metadata = { ...job.metadata, exportFormats: ['PNG'] };
    } else {
      const { imageUrl, provider } = await generateImage({
        module: 'ai-image',
        dna,
        customPrompt: job.prompt,
      });
      job.thumbnailUrl = await persistImage(userId, imageUrl);
      job.provider = provider;
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
  if (url.startsWith('data:')) {
    return uploadAssetFromDataUrl(userId, url, { folder: 'audio', fileName: `${randomUUID()}.mp3` });
  }
  return uploadAssetFromUrl(userId, url, { folder: 'audio', contentType: 'audio/mpeg' });
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
