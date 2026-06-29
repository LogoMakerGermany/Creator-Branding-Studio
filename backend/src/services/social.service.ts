import { randomUUID } from 'node:crypto';
import { dsGet, dsSet, dsDelete, dsList } from '../lib/data-store.js';
import { uploadAssetFromDataUrl } from '../lib/firebase-storage.js';
import { parseAndValidateDataUrl } from '../lib/upload-validation.js';
import { ServiceError } from '../lib/errors.js';
import { createCalendarEvent } from './calendar.service.js';

const POSTS_COLLECTION = 'socialPosts';

export type SocialPlatform = 'instagram' | 'youtube' | 'tiktok' | 'twitter' | 'discord' | 'twitch';
export type SocialPostStatus = 'draft' | 'scheduled' | 'published';

export interface SocialPost {
  id: string;
  userId: string;
  platform: SocialPlatform;
  content: string;
  mediaUrl?: string;
  scheduledAt?: string;
  publishedAt?: string;
  status: SocialPostStatus;
  engagement: { likes: number; comments: number; shares: number; views: number };
  createdAt: string;
  updatedAt: string;
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

export async function listSocialPosts(userId: string): Promise<SocialPost[]> {
  const posts = await dsList(POSTS_COLLECTION, { userId, orderBy: 'updatedAt', order: 'desc' });
  return posts as unknown as SocialPost[];
}

export async function createSocialPost(
  userId: string,
  data: {
    platform: SocialPlatform;
    content: string;
    scheduledAt?: string;
    mediaDataUrl?: string;
    mediaUrl?: string;
  }
): Promise<SocialPost> {
  const now = new Date().toISOString();
  const id = randomUUID();

  let mediaUrl = data.mediaUrl;
  if (data.mediaDataUrl?.trim()) {
    mediaUrl = await persistSocialMedia(userId, id, data.mediaDataUrl);
  }

  const post: SocialPost = {
    id,
    userId,
    platform: data.platform,
    content: data.content,
    mediaUrl,
    scheduledAt: data.scheduledAt,
    status: data.scheduledAt ? 'scheduled' : 'draft',
    engagement: { likes: 0, comments: 0, shares: 0, views: 0 },
    createdAt: now,
    updatedAt: now,
  };
  await dsSet(POSTS_COLLECTION, post.id, post as unknown as Record<string, unknown>);

  if (data.scheduledAt) {
    await createCalendarEvent(userId, {
      title: `[${data.platform}] ${data.content.slice(0, 80)}`,
      description: data.content,
      type: 'post',
      platform: data.platform,
      startAt: data.scheduledAt,
    }).catch(() => undefined);
  }

  return post;
}

export async function updateSocialPost(
  id: string,
  userId: string,
  data: Partial<Pick<SocialPost, 'content' | 'platform' | 'scheduledAt' | 'status' | 'mediaUrl'>> & {
    mediaDataUrl?: string;
  }
): Promise<SocialPost> {
  const post = await dsGet(POSTS_COLLECTION, id);
  if (!post || post.userId !== userId) {
    throw new ServiceError(404, 'NOT_FOUND', 'Post nicht gefunden');
  }

  let mediaUrl = data.mediaUrl ?? (post.mediaUrl as string | undefined);
  if (data.mediaDataUrl?.trim()) {
    mediaUrl = await persistSocialMedia(userId, id, data.mediaDataUrl);
  }

  const updated: Record<string, unknown> = {
    ...post,
    ...data,
    mediaUrl,
    updatedAt: new Date().toISOString(),
    publishedAt: data.status === 'published' ? new Date().toISOString() : post.publishedAt,
  };
  delete updated.mediaDataUrl;

  await dsSet(POSTS_COLLECTION, id, updated);
  return updated as unknown as SocialPost;
}

export async function deleteSocialPost(id: string, userId: string): Promise<void> {
  const post = await dsGet(POSTS_COLLECTION, id);
  if (!post || post.userId !== userId) {
    throw new ServiceError(404, 'NOT_FOUND', 'Post nicht gefunden');
  }
  await dsDelete(POSTS_COLLECTION, id);
}

export async function getSocialStats(userId: string): Promise<{
  totalPosts: number;
  scheduled: number;
  published: number;
  totalEngagement: number;
}> {
  const posts = await listSocialPosts(userId);
  return {
    totalPosts: posts.length,
    scheduled: posts.filter((p) => p.status === 'scheduled').length,
    published: posts.filter((p) => p.status === 'published').length,
    totalEngagement: posts.reduce(
      (sum, p) => sum + p.engagement.likes + p.engagement.comments + p.engagement.shares,
      0
    ),
  };
}
