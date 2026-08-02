import { Router } from 'express';
import { z } from 'zod';
import { Permission, CoinSpendCategory } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { getActiveDna } from '../services/dna.service.js';
import { listMediaJobs, getMediaJob, runMediaJob } from '../services/media.service.js';
import { withCoinCharge, withCoinChargePack } from '../lib/billable-job.js';

export const vtuberRoutes = Router();
vtuberRoutes.use(authenticate, requirePermission(Permission.USE_VTUBER_STUDIO));

vtuberRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const jobs = (await listMediaJobs(req.user!.uid)).filter((j) => j.type.startsWith('vtuber'));
    sendSuccess(res, { characters: jobs });
  })
);

const generateSchema = z.object({
  type: z.enum(['vtuber-character', 'vtuber-emote', 'vtuber-avatar']).default('vtuber-character'),
  prompt: z.string().max(500).optional(),
  title: z.string().max(100).optional(),
});

vtuberRoutes.post(
  '/generate',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = generateSchema.parse(req.body);
    const activeDna = await getActiveDna(req.user!.uid);
    if (!activeDna) throw new AppError(400, 'NO_DNA', 'Creator DNA erforderlich');

    const { job, coinsSpent, newBalance } = await withCoinCharge(
      req.user!.uid,
      CoinSpendCategory.AI_IMAGE,
      'VTuber Generierung',
      () =>
        runMediaJob(req.user!.uid, body.type, activeDna, {
          customPrompt: body.prompt,
          title: body.title,
        })
    );

    sendSuccess(res, { job, coinsSpent, newBalance }, 201);
  })
);

vtuberRoutes.post(
  '/generate-pack',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const activeDna = await getActiveDna(req.user!.uid);
    if (!activeDna) throw new AppError(400, 'NO_DNA', 'Creator DNA erforderlich');

    const types = ['vtuber-character', 'vtuber-avatar', 'vtuber-emote'] as const;
    const { jobs, coinsSpent, newBalance } = await withCoinChargePack(
      req.user!.uid,
      CoinSpendCategory.BRANDING_PACK,
      'VTuber Paket',
      () => Promise.all(types.map((type) => runMediaJob(req.user!.uid, type, activeDna)))
    );

    sendSuccess(res, { jobs, coinsSpent, newBalance }, 201);
  })
);

vtuberRoutes.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const job = await getMediaJob(String(req.params.id), req.user!.uid);
    if (!job) throw new AppError(404, 'NOT_FOUND', 'Nicht gefunden');
    sendSuccess(res, { job });
  })
);
