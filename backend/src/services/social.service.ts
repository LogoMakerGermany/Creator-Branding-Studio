import { randomUUID } from 'node:crypto';
import { dsGet, dsSet, dsDelete, dsList } from '../lib/data-store.js';

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

export async function listSocialPosts(userId: string): Promise<SocialPost[]> {
  const posts = await dsList(POSTS_COLLECTION, { userId, orderBy: 'updatedAt', order: 'desc' });
  return posts as unknown as SocialPost[];
}

export async function createSocialPost(
  userId: string,
  data: { platform: SocialPlatform; content: string; scheduledAt?: string; mediaUrl?: string }
): Promise<SocialPost> {
  const now = new Date().toISOString();
  const post: SocialPost = {
    id: randomUUID(),
    userId,
    platform: data.platform,
    content: data.content,
    mediaUrl: data.mediaUrl,
    scheduledAt: data.scheduledAt,
    status: data.scheduledAt ? 'scheduled' : 'draft',
    engagement: { likes: 0, comments: 0, shares: 0, views: 0 },
    createdAt: now,
    updatedAt: now,
  };
  await dsSet(POSTS_COLLECTION, post.id, post as unknown as Record<string, unknown>);
  return post;
}

export async function updateSocialPost(
  id: string,
  userId: string,
  data: Partial<Pick<SocialPost, 'content' | 'platform' | 'scheduledAt' | 'status' | 'mediaUrl'>>
): Promise<SocialPost> {
  const post = await dsGet(POSTS_COLLECTION, id);
  if (!post || post.userId !== userId) throw new Error('Post nicht gefunden');

  const updated: Record<string, unknown> = {
    ...post,
    ...data,
    updatedAt: new Date().toISOString(),
    publishedAt: data.status === 'published' ? new Date().toISOString() : post.publishedAt,
  };

  if (data.status === 'published' && post.status !== 'published') {
    updated.engagement = {
      likes: Math.floor(Math.random() * 500),
      comments: Math.floor(Math.random() * 50),
      shares: Math.floor(Math.random() * 30),
      views: Math.floor(Math.random() * 5000),
    };
  }

  await dsSet(POSTS_COLLECTION, id, updated);
  return updated as unknown as SocialPost;
}

export async function deleteSocialPost(id: string, userId: string): Promise<void> {
  const post = await dsGet(POSTS_COLLECTION, id);
  if (!post || post.userId !== userId) throw new Error('Post nicht gefunden');
  await dsDelete(POSTS_COLLECTION, id);
}

export async function getSocialStats(userId: string): Promise<{ totalPosts: number; scheduled: number; published: number; totalEngagement: number }> {
  const posts = await listSocialPosts(userId);
  return {
    totalPosts: posts.length,
    scheduled: posts.filter((p) => p.status === 'scheduled').length,
    published: posts.filter((p) => p.status === 'published').length,
    totalEngagement: posts.reduce((sum, p) => sum + p.engagement.likes + p.engagement.comments + p.engagement.shares, 0),
  };
}
