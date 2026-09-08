import { randomUUID } from 'node:crypto';
import { normalizePlannerStatus, plannerStatusLabel, type PlannerStatus } from '@ucbs/shared';
import { dsGet, dsSet, dsDelete, dsList } from '../lib/data-store.js';
import { uploadAssetFromDataUrl } from '../lib/firebase-storage.js';
import { parseAndValidateDataUrl } from '../lib/upload-validation.js';
import { ServiceError } from '../lib/errors.js';
import { parseCalendarIsoDate, upsertLinkedSocialCalendarEvent } from './calendar.service.js';
import { getContentPackage } from './text.service.js';
import { getMediaJob, getVideoProject } from './media.service.js';
import { getUserFile } from './file-cloud.service.js';
import { getJobsByUser } from './ai.service.js';
import { getProject } from './project.service.js';

const POSTS_COLLECTION = 'socialPosts';

export type SocialPlatform = 'instagram' | 'youtube' | 'tiktok' | 'twitter' | 'discord' | 'twitch';
/** Stored historically as draft|scheduled|published. New writes: draft|scheduled|ready. */
export type SocialPostStatus = 'draft' | 'scheduled' | 'published' | 'ready';

export interface SocialPost {
  id: string;
  userId: string;
  platform: SocialPlatform;
  content: string;
  mediaUrl?: string;
  mediaAssetId?: string;
  mediaKind?: string;
  packageId?: string;
  projectId?: string;
  scheduledAt?: string;
  publishedAt?: string;
  status: SocialPostStatus;
  version?: number;
  contentType?: string;
  /** Legacy field — never treat as platform analytics. */
  engagement?: { likes: number; comments: number; shares: number; views: number };
  createdAt: string;
  updatedAt: string;
}

export interface SocialPostView extends SocialPost {
  plannerStatus: PlannerStatus;
  plannerLabel: string;
  publishingAvailable: false;
  analyticsAvailable: false;
  platformConnected: false;
}

export function presentSocialPost(post: SocialPost): SocialPostView {
  const plannerStatus = normalizePlannerStatus(post.status);
  return {
    ...post,
    status: plannerStatus,
    plannerStatus,
    plannerLabel: plannerStatusLabel(plannerStatus),
    publishingAvailable: false,
    analyticsAvailable: false,
    platformConnected: false,
    engagement: undefined,
  };
}

async function persistSocialMedia(userId: string, postId: string, dataUrl: string): Promise<string> {
  const trimmed = dataUrl.trim();
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }
  const { mimeType } = parseAndValidateDataUrl(trimmed);
  const ext = mimeType.split('/')[1]?.replace('svg+xml', 'svg') || 'png';
  return uploadAssetFromDataUrl(userId, trimmed, {
    folder: 'social',
    fileName: `${postId}-media.${ext}`,
  });
}

export async function resolveOwnedMediaUrl(
  userId: string,
  input: { mediaAssetId?: string; mediaKind?: string; mediaUrl?: string }
): Promise<string | undefined> {
  if (input.mediaUrl && (input.mediaUrl.startsWith('https://') || input.mediaUrl.startsWith('http://'))) {
    const jobs = await getJobsByUser(userId);
    const files = input.mediaAssetId ? await getUserFile(input.mediaAssetId, userId) : null;
    const ownedJob = jobs.find((j) => j.imageUrl === input.mediaUrl);
    if (files || ownedJob) return input.mediaUrl;
    throw new ServiceError(403, 'MEDIA_NOT_OWNED', 'Dieses Medium gehört nicht zu deinem Account');
  }
  if (!input.mediaAssetId) return input.mediaUrl;
  const kind = input.mediaKind || 'file';
  if (kind === 'file' || kind === 'image' || kind === 'logo') {
    const file = await getUserFile(input.mediaAssetId, userId);
    if (file?.downloadUrl) return file.downloadUrl;
    const jobs = await getJobsByUser(userId);
    const job = jobs.find((j) => j.id === input.mediaAssetId && j.userId === userId);
    if (job?.imageUrl) return job.imageUrl;
    throw new ServiceError(404, 'NOT_FOUND', 'Medium nicht gefunden');
  }
  if (kind === 'video') {
    const video = await getVideoProject(input.mediaAssetId, userId);
    if (!video) throw new ServiceError(404, 'NOT_FOUND', 'Video nicht gefunden');
    return video.renderUrl || video.sourceUrl;
  }
  if (kind === 'short' || kind === 'animation' || kind === 'mockup' || kind === 'sticker' || kind === 'banner') {
    const job = await getMediaJob(input.mediaAssetId, userId);
    if (!job) {
      const jobs = await getJobsByUser(userId);
      const ai = jobs.find((j) => j.id === input.mediaAssetId);
      if (!ai) throw new ServiceError(404, 'NOT_FOUND', 'Medium nicht gefunden');
      return ai.imageUrl;
    }
    return job.videoUrl || job.imageUrl;
  }
  throw new ServiceError(404, 'NOT_FOUND', 'Medium nicht gefunden');
}

export async function listSocialPosts(userId: string): Promise<SocialPostView[]> {
  const posts = await dsList(POSTS_COLLECTION, { userId, orderBy: 'updatedAt', order: 'desc' });
  return (posts as unknown as SocialPost[]).map(presentSocialPost);
}

export async function getSocialPost(id: string, userId: string): Promise<SocialPostView | null> {
  const post = await dsGet(POSTS_COLLECTION, id);
  if (!post || post.userId !== userId) return null;
  return presentSocialPost(post as unknown as SocialPost);
}

function coerceWriteStatus(raw?: string, scheduledAt?: string): 'draft' | 'scheduled' | 'ready' {
  const normalized = normalizePlannerStatus(raw);
  if (normalized === 'ready') return 'ready';
  if (scheduledAt) return 'scheduled';
  return normalized;
}

export async function createSocialPost(
  userId: string,
  data: {
    platform: SocialPlatform;
    content: string;
    scheduledAt?: string;
    mediaDataUrl?: string;
    mediaUrl?: string;
    mediaAssetId?: string;
    mediaKind?: string;
    packageId?: string;
    projectId?: string;
    status?: string;
    contentType?: string;
  }
): Promise<SocialPostView> {
  const now = new Date().toISOString();
  const id = randomUUID();

  if (data.packageId) {
    const pkg = await getContentPackage(data.packageId, userId);
    if (!pkg) throw new ServiceError(404, 'NOT_FOUND', 'Content-Paket nicht gefunden');
  }
  if (data.projectId) {
    const project = await getProject(data.projectId, userId);
    if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  }

  let mediaUrl = data.mediaUrl;
  if (data.mediaDataUrl?.trim()) {
    mediaUrl = await persistSocialMedia(userId, id, data.mediaDataUrl);
  } else if (data.mediaAssetId) {
    mediaUrl = await resolveOwnedMediaUrl(userId, {
      mediaAssetId: data.mediaAssetId,
      mediaKind: data.mediaKind,
      mediaUrl: data.mediaUrl,
    });
  }

  if (data.scheduledAt) {
    data = { ...data, scheduledAt: parseCalendarIsoDate(data.scheduledAt, 'scheduledAt') };
  }

  if (data.scheduledAt) {
    const existing = (await listSocialPosts(userId)).find(
      (p) =>
        p.platform === data.platform &&
        p.content === data.content &&
        p.scheduledAt === data.scheduledAt &&
        (data.packageId ? p.packageId === data.packageId : true)
    );
    if (existing) return existing;
  }

  const status = coerceWriteStatus(data.status, data.scheduledAt);

  const post: SocialPost = {
    id,
    userId,
    platform: data.platform,
    content: data.content,
    mediaUrl,
    mediaAssetId: data.mediaAssetId,
    mediaKind: data.mediaKind,
    packageId: data.packageId,
    projectId: data.projectId,
    scheduledAt: data.scheduledAt,
    status,
    version: 1,
    contentType: data.contentType,
    createdAt: now,
    updatedAt: now,
  };
  await dsSet(POSTS_COLLECTION, post.id, post as unknown as Record<string, unknown>);

  if (data.scheduledAt) {
    await upsertLinkedSocialCalendarEvent(userId, post).catch(() => undefined);
  }

  return presentSocialPost(post);
}

export async function updateSocialPost(
  id: string,
  userId: string,
  data: Partial<
    Pick<SocialPost, 'content' | 'platform' | 'scheduledAt' | 'status' | 'mediaUrl' | 'packageId' | 'projectId' | 'contentType'>
  > & {
    mediaDataUrl?: string;
    mediaAssetId?: string;
    mediaKind?: string;
    clearSchedule?: boolean;
  }
): Promise<SocialPostView> {
  const post = await dsGet(POSTS_COLLECTION, id);
  if (!post || post.userId !== userId) {
    throw new ServiceError(404, 'NOT_FOUND', 'Post nicht gefunden');
  }

  if (data.packageId) {
    const pkg = await getContentPackage(data.packageId, userId);
    if (!pkg) throw new ServiceError(404, 'NOT_FOUND', 'Content-Paket nicht gefunden');
  }
  if (data.projectId) {
    const project = await getProject(data.projectId, userId);
    if (!project) throw new ServiceError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
  }

  let mediaUrl = data.mediaUrl ?? (post.mediaUrl as string | undefined);
  if (data.mediaDataUrl?.trim()) {
    mediaUrl = await persistSocialMedia(userId, id, data.mediaDataUrl);
  } else if (data.mediaAssetId) {
    mediaUrl = await resolveOwnedMediaUrl(userId, {
      mediaAssetId: data.mediaAssetId,
      mediaKind: data.mediaKind,
      mediaUrl: data.mediaUrl,
    });
  }

  let nextScheduledAt = post.scheduledAt as string | undefined;
  if (data.clearSchedule || data.scheduledAt === '') {
    nextScheduledAt = undefined;
  } else if (data.scheduledAt) {
    nextScheduledAt = parseCalendarIsoDate(data.scheduledAt, 'scheduledAt');
  }

  const nextStatus =
    data.clearSchedule || data.scheduledAt === ''
      ? data.status === 'ready' || data.status === 'published'
        ? 'ready'
        : 'draft'
      : coerceWriteStatus(data.status ?? String(post.status), nextScheduledAt);

  const contentChanged = data.content != null && data.content !== post.content;
  const scheduleChanged = nextScheduledAt !== post.scheduledAt;
  const nextVersion =
    contentChanged || scheduleChanged
      ? (typeof post.version === 'number' ? post.version : 1) + 1
      : typeof post.version === 'number'
        ? post.version
        : 1;

  const updated: Record<string, unknown> = {
    ...post,
    ...data,
    mediaUrl,
    scheduledAt: nextScheduledAt,
    status: nextStatus,
    version: nextVersion,
    updatedAt: new Date().toISOString(),
  };
  delete updated.mediaDataUrl;
  delete updated.engagement;
  delete updated.clearSchedule;
  if (!nextScheduledAt) delete updated.scheduledAt;

  await dsSet(POSTS_COLLECTION, id, updated);
  const view = presentSocialPost(updated as unknown as SocialPost);
  await upsertLinkedSocialCalendarEvent(userId, {
    id: view.id,
    content: view.content,
    platform: view.platform,
    scheduledAt: view.scheduledAt,
    status: view.status,
    packageId: view.packageId,
    projectId: view.projectId,
    contentType: view.contentType,
  }).catch(() => undefined);
  return view;
}

export async function deleteSocialPost(id: string, userId: string): Promise<void> {
  const post = await dsGet(POSTS_COLLECTION, id);
  if (!post || post.userId !== userId) {
    throw new ServiceError(404, 'NOT_FOUND', 'Post nicht gefunden');
  }
  await upsertLinkedSocialCalendarEvent(userId, {
    id,
    content: String(post.content ?? ''),
    platform: String(post.platform ?? 'tiktok'),
    scheduledAt: undefined,
    status: 'draft',
    packageId: post.packageId as string | undefined,
    projectId: post.projectId as string | undefined,
    contentType: post.contentType as string | undefined,
  }).catch(() => undefined);
  await dsDelete(POSTS_COLLECTION, id);
}

export async function getSocialStats(userId: string): Promise<{
  totalPosts: number;
  draft: number;
  scheduled: number;
  ready: number;
  publishingAvailable: false;
  analyticsAvailable: false;
}> {
  const posts = await listSocialPosts(userId);
  return {
    totalPosts: posts.length,
    draft: posts.filter((p) => p.plannerStatus === 'draft').length,
    scheduled: posts.filter((p) => p.plannerStatus === 'scheduled').length,
    ready: posts.filter((p) => p.plannerStatus === 'ready').length,
    publishingAvailable: false,
    analyticsAvailable: false,
  };
}
