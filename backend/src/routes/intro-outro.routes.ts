import { Router } from 'express';
import { z } from 'zod';
import { Permission, CoinSpendCategory } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { getActiveDna } from '../services/dna.service.js';
import { listMediaJobs, runMediaJob } from '../services/media.service.js';
import { withCoinCharge, withCoinChargePack } from '../lib/billable-job.js';

export const introOutroRoutes = Router();
introOutroRoutes.use(authenticate, requirePermission(Permission.USE_VIDEO_STUDIO));

introOutroRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const jobs = (await listMediaJobs(req.user!.uid)).filter((j) =>
      ['intro', 'outro', 'stream-start', 'stream-end'].includes(j.type)
    );
    sendSuccess(res, { jobs });
  })
);

const generateSchema = z.object({
  type: z.enum(['intro', 'outro', 'stream-start', 'stream-end']),
  prompt: z.string().max(500).optional(),
  title: z.string().max(100).optional(),
});

introOutroRoutes.post(
  '/generate',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = generateSchema.parse(req.body);
    const activeDna = await getActiveDna(req.user!.uid);
    if (!activeDna) throw new AppError(400, 'NO_DNA', 'Creator DNA erforderlich');

    const { job, coinsSpent, newBalance } = await withCoinCharge(
      req.user!.uid,
      CoinSpendCategory.VIDEO_EDIT,
      `${body.type} Generierung`,
      () =>
        runMediaJob(req.user!.uid, body.type, activeDna, {
          customPrompt: body.prompt,
          title: body.title,
          duration: body.type === 'intro' || body.type === 'outro' ? 10 : 15,
        })
    );

    sendSuccess(res, { job, coinsSpent, newBalance }, 201);
  })
);

introOutroRoutes.post(
  '/generate-pack',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const activeDna = await getActiveDna(req.user!.uid);
    if (!activeDna) throw new AppError(400, 'NO_DNA', 'Creator DNA erforderlich');

    const types = ['intro', 'outro', 'stream-start', 'stream-end'] as const;
    const { jobs, coinsSpent, newBalance } = await withCoinChargePack(
      req.user!.uid,
      CoinSpendCategory.BRANDING_PACK,
      'Intro/Outro Paket',
      () =>
        Promise.all(types.map((type) => runMediaJob(req.user!.uid, type, activeDna, { duration: 10 })))
    );

    sendSuccess(res, { jobs, coinsSpent, newBalance }, 201);
  })
);
