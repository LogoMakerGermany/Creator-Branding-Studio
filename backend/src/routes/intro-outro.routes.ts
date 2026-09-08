import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { listMediaJobs } from '../services/media.service.js';

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

introOutroRoutes.post(
  '/generate',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    z.object({}).passthrough().parse(req.body ?? {});
    throw new AppError(
      400,
      'INTRO_REQUIRES_QUOTE',
      'Intro/Outro startet nur über Nexter nach Bestätigung (Für X Coins erstellen).'
    );
  })
);

introOutroRoutes.post(
  '/generate-pack',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    z.object({}).passthrough().parse(req.body ?? {});
    throw new AppError(
      400,
      'INTRO_REQUIRES_QUOTE',
      'Intro/Outro-Paket startet nur über Nexter nach Bestätigung (Für X Coins erstellen).'
    );
  })
);
