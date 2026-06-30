import { Router } from 'express';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  getCcdDashboard,
  acceptEvolutionProposal,
  rejectEvolutionProposal,
  getCcdPromptContext,
} from '../services/creator-dna-engine/index.js';

export const ccdRoutes = Router();
ccdRoutes.use(authenticate, requirePermission(Permission.VIEW_DNA));

ccdRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, await getCcdDashboard(req.user!.uid));
  })
);

ccdRoutes.get(
  '/context',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, await getCcdPromptContext(req.user!.uid));
  })
);

ccdRoutes.post(
  '/evolution/:id/accept',
  requirePermission(Permission.EDIT_DNA),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await acceptEvolutionProposal(req.user!.uid, String(req.params.id));
    if (!result) throw new AppError(404, 'NOT_FOUND', 'Evolution nicht gefunden');
    sendSuccess(res, result);
  })
);

ccdRoutes.post(
  '/evolution/:id/reject',
  requirePermission(Permission.EDIT_DNA),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await rejectEvolutionProposal(req.user!.uid, String(req.params.id));
    if (!result) throw new AppError(404, 'NOT_FOUND', 'Evolution nicht gefunden');
    sendSuccess(res, { proposal: result });
  })
);
