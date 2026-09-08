import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { getJob, getJobsByUser } from '../services/ai.service.js';
import { LEGACY_IMAGE_GENERATE_MESSAGE } from '../lib/provider-gate.js';

export const aiRoutes = Router();

const generateSchema = z.object({
  prompt: z.string().max(500).optional(),
  module: z.enum(['logo', 'banner', 'facecam', 'ai-image']).default('ai-image'),
});

aiRoutes.use(authenticate);

aiRoutes.get(
  '/image',
  requirePermission(Permission.USE_AI_IMAGE),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const jobs = (await getJobsByUser(req.user!.uid)).filter((j) =>
      ['ai-image', 'logo', 'banner', 'facecam'].includes(j.module)
    );
    sendSuccess(res, { jobs });
  })
);

aiRoutes.post(
  '/image/generate',
  requirePermission(Permission.USE_AI_IMAGE),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    generateSchema.parse(req.body ?? {});
    throw new AppError(400, 'IMAGE_REQUIRES_QUOTE', LEGACY_IMAGE_GENERATE_MESSAGE);
  })
);

aiRoutes.get(
  '/image/:jobId',
  requirePermission(Permission.USE_AI_IMAGE),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const job = await getJob(String(req.params.jobId));
    if (!job || job.userId !== req.user!.uid) {
      throw new AppError(404, 'NOT_FOUND', 'Job nicht gefunden');
    }
    sendSuccess(res, { job });
  })
);

// Placeholder routes removed – Phase 3 implemented in ai-media.routes.ts
