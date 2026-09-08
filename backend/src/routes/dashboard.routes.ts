import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, sendSuccess } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { getDashboardSummary } from '../services/dashboard.service.js';

export const dashboardRoutes = Router();
dashboardRoutes.use(authenticate);

dashboardRoutes.get(
  '/summary',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, { dashboard: await getDashboardSummary(req.user!.uid) });
  })
);
