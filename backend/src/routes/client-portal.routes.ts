import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  listProjectsForPortalUser,
  addProjectFeedback,
} from '../services/agency-management.service.js';
import { getPortalProjectForUser } from '../lib/access-control.js';

export const clientPortalRoutes = Router();
clientPortalRoutes.use(authenticate, requirePermission(Permission.ACCESS_CLIENT_PORTAL));

clientPortalRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const projects = await listProjectsForPortalUser(req.user!.uid);
    sendSuccess(res, { projects });
  })
);

clientPortalRoutes.get(
  '/projects/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const project = await getPortalProjectForUser(req.user!.uid, String(req.params.id));
    sendSuccess(res, { project });
  })
);

const feedbackSchema = z.object({
  message: z.string().min(1).max(2000),
});

clientPortalRoutes.post(
  '/projects/:id/feedback',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = feedbackSchema.parse(req.body);
    await getPortalProjectForUser(req.user!.uid, String(req.params.id));
    try {
      const project = await addProjectFeedback(String(req.params.id), req.user!.uid, body.message);
      sendSuccess(res, { project }, 201);
    } catch {
      throw new AppError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
    }
  })
);
