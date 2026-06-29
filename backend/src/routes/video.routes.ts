import { Router } from 'express';
import { z } from 'zod';
import { Permission, CoinSpendCategory } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { getActiveDna } from '../services/dna.service.js';
import { deductCoins } from '../services/coins.service.js';
import {
  listVideoProjects,
  getVideoProject,
  createVideoProject,
  detectHighlights,
  generateSubtitles,
  renderVideoProject,
  createShortFromHighlight,
  listMediaJobs,
  attachVideoSource,
} from '../services/media.service.js';

export const videoRoutes = Router();
videoRoutes.use(authenticate, requirePermission(Permission.USE_VIDEO_STUDIO));

videoRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, {
      projects: await listVideoProjects(req.user!.uid),
      jobs: await listMediaJobs(req.user!.uid, 'video-edit'),
    });
  })
);

videoRoutes.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const project = await getVideoProject(String(req.params.id), req.user!.uid);
    if (!project) throw new AppError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
    sendSuccess(res, { project });
  })
);

const createSchema = z.object({
  title: z.string().min(1).max(200),
  duration: z.number().min(1).max(7200).default(300),
});

videoRoutes.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = createSchema.parse(req.body);
    const activeDna = await getActiveDna(req.user!.uid);
    const project = await createVideoProject(req.user!.uid, body.title, body.duration);
    if (activeDna) {
      project.dnaId = activeDna.id;
    }
    sendSuccess(res, { project }, 201);
  })
);

videoRoutes.post(
  '/:id/highlights',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const activeDna = await getActiveDna(req.user!.uid);
    const project = await detectHighlights(
      String(req.params.id),
      req.user!.uid,
      activeDna?.styleDirection
    );
    sendSuccess(res, { project });
  })
);

videoRoutes.post(
  '/:id/subtitles',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const project = await generateSubtitles(String(req.params.id), req.user!.uid);
    sendSuccess(res, { project });
  })
);

videoRoutes.post(
  '/:id/render',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const project = await renderVideoProject(String(req.params.id), req.user!.uid);
    sendSuccess(res, { project });
  })
);

videoRoutes.post(
  '/:id/shorts',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const activeDna = await getActiveDna(req.user!.uid);
    if (!activeDna) throw new AppError(400, 'NO_DNA', 'Creator DNA erforderlich');

    const coinResult = await deductCoins(req.user!.uid, CoinSpendCategory.VIDEO_EDIT, 'Short erstellen');
    if (!coinResult.success) throw new AppError(402, 'INSUFFICIENT_COINS', 'Nicht genügend Coins');

    const highlightIndex = Number(req.body.highlightIndex ?? 0);
    const job = await createShortFromHighlight(
      String(req.params.id),
      req.user!.uid,
      highlightIndex,
      activeDna
    );
    sendSuccess(res, { job, coinsSpent: coinResult.cost, newBalance: coinResult.newBalance }, 201);
  })
);

const sourceSchema = z.object({
  dataUrl: z.string().min(20),
  duration: z.number().min(1).max(7200).optional(),
});

videoRoutes.post(
  '/:id/source',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = sourceSchema.parse(req.body);
    const project = await attachVideoSource(
      String(req.params.id),
      req.user!.uid,
      body.dataUrl,
      body.duration
    );
    sendSuccess(res, { project });
  })
);
