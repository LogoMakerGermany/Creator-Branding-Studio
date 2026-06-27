import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  listSocialPosts,
  createSocialPost,
  updateSocialPost,
  deleteSocialPost,
  getSocialStats,
} from '../services/social.service.js';

export const socialRoutes = Router();
socialRoutes.use(authenticate, requirePermission(Permission.MANAGE_SOCIAL));

socialRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, {
      posts: await listSocialPosts(req.user!.uid),
      stats: await getSocialStats(req.user!.uid),
    });
  })
);

const createSchema = z.object({
  platform: z.enum(['instagram', 'youtube', 'tiktok', 'twitter', 'discord', 'twitch']),
  content: z.string().min(1).max(2000),
  scheduledAt: z.string().optional(),
  mediaUrl: z.string().optional(),
});

socialRoutes.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = createSchema.parse(req.body);
    const post = await createSocialPost(req.user!.uid, body);
    sendSuccess(res, { post }, 201);
  })
);

socialRoutes.patch(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const post = await updateSocialPost(String(req.params.id), req.user!.uid, req.body);
      sendSuccess(res, { post });
    } catch {
      throw new AppError(404, 'NOT_FOUND', 'Post nicht gefunden');
    }
  })
);

socialRoutes.delete(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      await deleteSocialPost(String(req.params.id), req.user!.uid);
      sendSuccess(res, { deleted: true });
    } catch {
      throw new AppError(404, 'NOT_FOUND', 'Post nicht gefunden');
    }
  })
);
