import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  downloadAnimation,
  getAnimation,
  listAnimationVersions,
  listAnimations,
  listOwnedAnimationSources,
} from '../services/animation.service.js';
import { toClientFile } from '../services/file-cloud.service.js';

export const animationRoutes = Router();
animationRoutes.use(authenticate, requirePermission(Permission.USE_VIDEO_STUDIO));

animationRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, { jobs: await listAnimations(req.user!.uid) });
  })
);

animationRoutes.get(
  '/assets',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const files = await listOwnedAnimationSources(req.user!.uid);
    sendSuccess(res, { files: files.map((f) => toClientFile(f, f.downloadUrl)) });
  })
);

animationRoutes.get(
  '/:id/download',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await downloadAnimation(String(req.params.id), req.user!.uid);
    sendSuccess(res, result);
  })
);

animationRoutes.get(
  '/:id/versions',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const versions = await listAnimationVersions(String(req.params.id), req.user!.uid);
    sendSuccess(res, { versions });
  })
);

animationRoutes.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const job = await getAnimation(String(req.params.id), req.user!.uid);
    if (!job) throw new AppError(404, 'NOT_FOUND', 'Animation nicht gefunden');
    sendSuccess(res, { job });
  })
);

animationRoutes.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    z.object({}).passthrough().parse(req.body ?? {});
    throw new AppError(
      400,
      'ANIMATION_REQUIRES_QUOTE',
      'Animation startet nur über Nexter nach Bestätigung (Erstellen).'
    );
  })
);
