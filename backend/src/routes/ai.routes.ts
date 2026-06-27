import { Router } from 'express';
import { z } from 'zod';
import { Permission, CoinSpendCategory } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { getActiveDna } from '../services/dna.service.js';
import { deductCoins } from '../services/coins.service.js';
import { runGenerationJob, getJob, getJobsByUser } from '../services/ai.service.js';

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
    const body = generateSchema.parse(req.body);

    const activeDna = await getActiveDna(req.user!.uid);
    if (!activeDna) {
      throw new AppError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');
    }

    const coinResult = await deductCoins(
      req.user!.uid,
      CoinSpendCategory.AI_IMAGE,
      `KI Bildgenerierung (${body.module})`
    );

    if (!coinResult.success) {
      throw new AppError(402, 'INSUFFICIENT_COINS', 'Nicht genügend Coins', {
        required: coinResult.cost,
        balance: coinResult.newBalance,
      });
    }

    const job = await runGenerationJob(
      req.user!.uid,
      body.module,
      activeDna,
      body.prompt
    );

    sendSuccess(res, {
      job,
      coinsSpent: coinResult.cost,
      newBalance: coinResult.newBalance,
    }, 201);
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
