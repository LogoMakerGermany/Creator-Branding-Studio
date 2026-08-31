import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { ServiceError } from '../lib/errors.js';
import {
  listSocialPosts,
  createSocialPost,
  updateSocialPost,
  deleteSocialPost,
  getSocialStats,
  getSocialPost,
} from '../services/social.service.js';

export const socialRoutes = Router();
socialRoutes.use(authenticate, requirePermission(Permission.MANAGE_SOCIAL));

function mapSocialError(err: unknown): never {
  if (err instanceof ServiceError) {
    throw new AppError(err.statusCode, err.code, err.message);
  }
  throw new AppError(400, 'SOCIAL_ERROR', err instanceof Error ? err.message : 'Social-Fehler');
}

socialRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, {
      posts: await listSocialPosts(req.user!.uid),
      stats: await getSocialStats(req.user!.uid),
    });
  })
);

socialRoutes.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const post = await getSocialPost(String(req.params.id), req.user!.uid);
    if (!post) throw new AppError(404, 'NOT_FOUND', 'Post nicht gefunden');
    sendSuccess(res, { post });
  })
);

const createSchema = z.object({
  platform: z.enum(['instagram', 'youtube', 'tiktok', 'twitter', 'discord', 'twitch']),
  content: z.string().min(1).max(4000),
  scheduledAt: z.string().optional(),
  mediaDataUrl: z.string().min(20).optional(),
  mediaUrl: z.string().url().optional(),
  mediaAssetId: z.string().max(80).optional(),
  mediaKind: z.string().max(40).optional(),
  packageId: z.string().max(80).optional(),
  projectId: z.string().max(80).optional(),
  status: z.enum(['draft', 'scheduled', 'ready', 'published']).optional(),
});

socialRoutes.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = createSchema.parse(req.body);
    try {
      const post = await createSocialPost(req.user!.uid, body);
      sendSuccess(res, { post }, 201);
    } catch (err) {
      mapSocialError(err);
    }
  })
);

const updateSchema = z.object({
  content: z.string().min(1).max(4000).optional(),
  platform: z.enum(['instagram', 'youtube', 'tiktok', 'twitter', 'discord', 'twitch']).optional(),
  scheduledAt: z.string().optional(),
  status: z.enum(['draft', 'scheduled', 'ready', 'published']).optional(),
  mediaDataUrl: z.string().min(20).optional(),
  mediaUrl: z.string().url().optional(),
  mediaAssetId: z.string().max(80).optional(),
  mediaKind: z.string().max(40).optional(),
  packageId: z.string().max(80).optional(),
  projectId: z.string().max(80).optional(),
});

socialRoutes.patch(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const body = updateSchema.parse(req.body);
      const post = await updateSocialPost(String(req.params.id), req.user!.uid, body);
      sendSuccess(res, { post });
    } catch (err) {
      mapSocialError(err);
    }
  })
);

socialRoutes.delete(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      await deleteSocialPost(String(req.params.id), req.user!.uid);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      mapSocialError(err);
    }
  })
);
