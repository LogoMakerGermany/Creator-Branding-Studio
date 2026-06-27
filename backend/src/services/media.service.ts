import { randomUUID } from 'node:crypto';
import type { CreatorDNA } from '@ucbs/shared';
import { dsGet, dsList, dsSet } from '../lib/data-store.js';
import { uploadAssetFromDataUrl, uploadAssetFromUrl } from '../lib/firebase-storage.js';
import { buildPromptFromDNA, generateImage } from './ai.service.js';
import { generateMusic, generateSpeech, generateVideo, analyzeVideoContent } from '../lib/media-providers.js';

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
  subtitles: SubtitleEntry[];
  highlights: HighlightSegment[];
  shorts: MediaJob[];
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
  duration: number
): Promise<VideoProject> {
  const now = new Date().toISOString();
  const project: VideoProject = {
    id: randomUUID(),
    userId,
    title,
    duration,
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

export async function detectHighlights(projectId: string, userId: string): Promise<VideoProject> {
  const project = await getVideoProject(projectId, userId);
  if (!project) throw new Error('Projekt nicht gefunden');

  const analysis = await analyzeVideoContent(project.title, project.duration);
  project.highlights = analysis.highlights;
  project.status = 'processing';
  project.updatedAt = new Date().toISOString();
  await dsSet(VIDEO_COLLECTION, project.id, project as unknown as Record<string, unknown>);
  return project;
}

export async function generateSubtitles(projectId: string, userId: string): Promise<VideoProject> {
  const project = await getVideoProject(projectId, userId);
  if (!project) throw new Error('Projekt nicht gefunden');

  const analysis = await analyzeVideoContent(project.title, project.duration);
  project.subtitles = analysis.subtitles;
  project.updatedAt = new Date().toISOString();
  await dsSet(VIDEO_COLLECTION, project.id, project as unknown as Record<string, unknown>);
  return project;
}

export async function createShortFromHighlight(
  projectId: string,
  userId: string,
  highlightIndex: number,
  dna: CreatorDNA
): Promise<MediaJob> {
  const project = await getVideoProject(projectId, userId);
  if (!project) throw new Error('Projekt nicht gefunden');
  const highlight = project.highlights[highlightIndex];
  if (!highlight) throw new Error('Highlight nicht gefunden');

  const job = await runMediaJob(userId, 'short', dna, {
    customPrompt: `Vertical TikTok/Shorts clip, ${highlight.label}, ${dna.styleDirection} style, dynamic editing`,
    title: `Short: ${highlight.label}`,
    duration: highlight.end - highlight.start,
    metadata: { projectId, highlightIndex, start: highlight.start, end: highlight.end },
  });

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
  const prompts: Record<string, string> = {
    intro: `Epic stream intro animation, ${dna.styleDirection} style, logo reveal, dynamic`,
    outro: `Stream outro/end screen, ${dna.styleDirection}, subscribe reminder, branded`,
    'stream-start': `Starting soon screen, ${dna.styleDirection} gaming stream`,
    'stream-end': `Stream ending screen, thank you message, ${dna.styleDirection}`,
    'vtuber-character': `VTuber anime character full body, ${dna.styleDirection}, mascot design`,
    'vtuber-emote': `VTuber emote expression pack style, ${dna.styleDirection}, cute chibi`,
    'vtuber-avatar': `VTuber avatar portrait, anime style, ${dna.styleDirection}`,
    'ai-video': `Social media promotional video thumbnail, ${dna.styleDirection}`,
    short: `Vertical 9:16 short video thumbnail, ${dna.styleDirection}, dynamic`,
    'video-edit': `Video edit preview, ${dna.styleDirection}`,
    'ai-music': `Background music for ${dna.styleDirection} stream`,
    'ai-voice': `Stream intro voiceover script`,
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
      job.status = 'completed';
    } else if (type === 'ai-voice') {
      const script = options?.customPrompt || generateVoiceScript(dna);
      const speech = await generateSpeech(script);
      job.audioUrl = await persistAudio(userId, speech.audioUrl);
      job.provider = speech.provider;
      job.metadata = { ...job.metadata, transcript: script, voice: 'Creator Pro' };
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
      job.metadata = { ...job.metadata, exportFormats: ['PNG', 'GIF', 'Live2D-ready'] };
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

export function generateDevPlaceholderSvg(dna: CreatorDNA, label: string): string {
  const primary = dna.primaryColors[0] || '#7C3AED';
  const secondary = dna.secondaryColors[0] || '#1E1B4B';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="576" viewBox="0 0 1024 576">
    <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${secondary}"/><stop offset="100%" style="stop-color:${primary}"/>
    </linearGradient></defs>
    <rect width="1024" height="576" fill="url(#g)"/>
    <text x="512" y="260" text-anchor="middle" fill="white" font-size="36" font-family="Arial">${label.toUpperCase()}</text>
    <text x="512" y="310" text-anchor="middle" fill="white" opacity="0.7" font-size="20">${dna.styleDirection}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
