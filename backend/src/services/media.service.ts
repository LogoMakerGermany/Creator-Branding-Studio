import type { CreatorDNA, VideoFormatId } from '@ucbs/shared';
import { buildDnaPromptContext, getVideoFormatPreset, ffmpegScaleFilter } from '@ucbs/shared';
import { dsGet, dsList, dsSet } from '../lib/data-store.js';
import { uploadAssetFromDataUrl, uploadAssetFromUrl } from '../lib/firebase-storage.js';
import { buildPromptFromDNA, generateImage } from './ai.service.js';
import { generateMusic, generateSpeech, generateVideo } from '../lib/media-providers.js';
import {
  analyzeVideoFromSource,
  detectHighlightsFromSubtitles,
  transcribeVideoSource,
} from '../lib/video-analysis.js';
import {
  burnSubtitlesIntoVideo,
  buildSrtContent,
  clipVideoSegment,
  convertMp4ToGif,
  convertMp4ToWebm,
  inferMusicMetadata,
} from '../lib/video-processing.js';
import { getElevenLabsVoiceId } from '../config/env.js';
import { randomUUID } from 'node:crypto';
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
  | 'ai-voice';

export interface VideoProject {
  id: string;
  userId: string;
  title: string;
  sourceUrl?: string;
  duration: number;
  dnaId?: string;
  format?: VideoFormatId;
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
  return projects as unknown as VideoProject[];
}

export async function getVideoProject(id: string, userId: string): Promise<VideoProject | null> {
  const p = await dsGet(VIDEO_COLLECTION, id);
  if (!p || p.userId !== userId) return null;
  return p as unknown as VideoProject;
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
  if (!project) throw new Error('Projekt nicht gefunden');

  const { parseAndValidateVideoDataUrl } = await import('../lib/upload-validation.js');
  parseAndValidateVideoDataUrl(dataUrl);

  const sourceUrl = await uploadAssetFromDataUrl(userId, dataUrl, {
    folder: 'video-sources',
    fileName: `${projectId}.mp4`,
  });

  project.sourceUrl = sourceUrl;
  if (duration && duration > 0) {
    project.duration = Math.min(Math.round(duration), 7200);
  }
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
  if (!project) throw new Error('Projekt nicht gefunden');
  if (!project.sourceUrl) throw new Error('Video-Quelle fehlt — zuerst hochladen');

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
  if (!project) throw new Error('Projekt nicht gefunden');
  if (!project.sourceUrl) throw new Error('Video-Quelle fehlt — zuerst hochladen');

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
  if (!project) throw new Error('Projekt nicht gefunden');
  if (!project.sourceUrl) throw new Error('Video-Quelle fehlt');
  if (!project.subtitles.length) throw new Error('Untertitel fehlen — zuerst generieren');

  const rendered = await burnSubtitlesIntoVideo(project.sourceUrl, project.subtitles);
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
  if (!project) throw new Error('Projekt nicht gefunden');
  if (!project.sourceUrl) throw new Error('Video-Quelle fehlt');

  const analysis = await analyzeVideoFromSource(
    project.sourceUrl,
    project.title,
    project.duration,
    styleDirection
  );
  project.subtitles = analysis.subtitles;
  project.highlights = analysis.highlights;
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
  formatOverride?: VideoFormatId
): Promise<MediaJob> {
  const project = await getVideoProject(projectId, userId);
  if (!project) throw new Error('Projekt nicht gefunden');
  if (!project.sourceUrl) throw new Error('Video-Quelle fehlt — Shorts benötigen ein hochgeladenes Video');
  const highlight = project.highlights[highlightIndex];
  if (!highlight) throw new Error('Highlight nicht gefunden');

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
    const scaleFilter = ffmpegScaleFilter(format);
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

export async function runMediaJob(
  userId: string,
  type: MediaJobType,
  dna: CreatorDNA,
  options?: {
    customPrompt?: string;
    title?: string;
    duration?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<MediaJob> {
  const dnaCtx = buildDnaPromptContext(dna);
  const prompts: Record<string, string> = {
    intro: `Epic stream intro animation for ${dna.name}, ${dna.styleDirection} style, logo reveal, dynamic. ${dnaCtx}`,
    outro: `Stream outro/end screen for ${dna.name}, ${dna.styleDirection}, subscribe reminder, branded. ${dnaCtx}`,
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
      type === 'outro'
    ) {
      const aspectRatio = type === 'short' ? '9:16' : '16:9';
      const video = await generateVideo(job.prompt, {
        aspectRatio,
        duration: options?.duration || (type === 'intro' || type === 'outro' ? 6 : 10),
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
