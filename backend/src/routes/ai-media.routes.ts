import { Router } from 'express';
import { Permission, CoinSpendCategory } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { getActiveDna } from '../services/dna.service.js';
import { listMediaJobs, getMediaJob, runMediaJob } from '../services/media.service.js';
import { withCoinCharge } from '../lib/billable-job.js';

function createAiMediaRoutes(
  type: 'ai-video' | 'ai-music' | 'ai-voice',
  permission: Permission,
  coinCategory: CoinSpendCategory,
  label: string
) {
  const router = Router();
  router.use(authenticate, requirePermission(permission));

  router.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, { jobs: await listMediaJobs(req.user!.uid, type) });
  }));

  router.post('/generate', asyncHandler(async (req: AuthenticatedRequest, res) => {
    const activeDna = await getActiveDna(req.user!.uid);
    if (!activeDna) throw new AppError(400, 'NO_DNA', 'Creator DNA erforderlich');

    const { job, coinsSpent, newBalance } = await withCoinCharge(
      req.user!.uid,
      coinCategory,
      label,
      () =>
        runMediaJob(req.user!.uid, type, activeDna, {
          customPrompt: req.body.prompt,
          title: req.body.title,
          duration: req.body.duration,
        })
    );

    sendSuccess(res, { job, coinsSpent, newBalance }, 201);
  }));

  router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
    const job = await getMediaJob(String(req.params.id), req.user!.uid);
    if (!job) throw new AppError(404, 'NOT_FOUND', 'Nicht gefunden');
    sendSuccess(res, { job });
  }));

  return router;
}

export const aiVideoRoutes = createAiMediaRoutes(
  'ai-video',
  Permission.USE_AI_VIDEO,
  CoinSpendCategory.AI_VIDEO,
  'KI Video Generierung'
);

export const aiMusicRoutes = createAiMediaRoutes(
  'ai-music',
  Permission.USE_AI_MUSIC,
  CoinSpendCategory.AI_MUSIC,
  'KI Musik Generierung'
);

export const aiVoiceRoutes = createAiMediaRoutes(
  'ai-voice',
  Permission.USE_AI_VOICE,
  CoinSpendCategory.AI_VOICE,
  'KI Stimme Generierung'
);
