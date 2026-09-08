import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { listMediaJobs, getMediaJob } from '../services/media.service.js';

export const vtuberRoutes = Router();
vtuberRoutes.use(authenticate, requirePermission(Permission.USE_VTUBER_STUDIO));

vtuberRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const jobs = (await listMediaJobs(req.user!.uid)).filter((j) => j.type.startsWith('vtuber'));
    sendSuccess(res, { characters: jobs });
  })
);

vtuberRoutes.post(
  '/generate',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    z.object({}).passthrough().parse(req.body ?? {});
    throw new AppError(
      400,
      'VTUBER_REQUIRES_QUOTE',
      'VTuber-Generierung startet nur über Nexter nach Bestätigung (Für X Coins erstellen).'
    );
  })
);

vtuberRoutes.post(
  '/generate-pack',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    z.object({}).passthrough().parse(req.body ?? {});
    throw new AppError(
      400,
      'VTUBER_REQUIRES_QUOTE',
      'VTuber-Paket startet nur über Nexter nach Bestätigung (Für X Coins erstellen).'
    );
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
