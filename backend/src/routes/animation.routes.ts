import { Router } from 'express';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { listAnimations } from '../services/animation.service.js';

export const animationRoutes = Router();
animationRoutes.use(authenticate, requirePermission(Permission.USE_VIDEO_STUDIO));

animationRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, { jobs: await listAnimations(req.user!.uid) });
  })
);

animationRoutes.post(
  '/',
  asyncHandler(async (_req: AuthenticatedRequest, res) => {
    throw new AppError(
      400,
      'ANIMATION_REQUIRES_QUOTE',
      'Animation startet nur über Nexter nach Bestätigung (Erstellen).'
    );
  })
);
