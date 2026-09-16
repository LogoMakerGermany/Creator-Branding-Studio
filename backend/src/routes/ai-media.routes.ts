import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { listMediaJobs, getMediaJob } from '../services/media.service.js';
import { downloadAiVideo } from '../services/ai-video.service.js';
import { LEGACY_VIDEO_GENERATE_MESSAGE } from '../lib/provider-gate.js';

export const aiVideoRoutes = Router();
aiVideoRoutes.use(authenticate, requirePermission(Permission.USE_AI_VIDEO));

aiVideoRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, { jobs: await listMediaJobs(req.user!.uid, 'ai-video') });
  })
);

aiVideoRoutes.post(
  '/generate',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    z.object({}).passthrough().parse(req.body ?? {});
    throw new AppError(400, 'VIDEO_REQUIRES_QUOTE', LEGACY_VIDEO_GENERATE_MESSAGE);
  })
);

aiVideoRoutes.get(
  '/:id/download',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await downloadAiVideo(String(req.params.id), req.user!.uid);
    sendSuccess(res, result);
  })
);

aiVideoRoutes.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const job = await getMediaJob(String(req.params.id), req.user!.uid);
    if (!job) throw new AppError(404, 'NOT_FOUND', 'Nicht gefunden');
    sendSuccess(res, { job });
  })
);
