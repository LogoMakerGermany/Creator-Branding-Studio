import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  listChangeRequests,
  getChangeRequest,
  createChangeRequest,
  restoreVersion,
  compareVersions,
  getVersionsForJob,
} from '../services/change-request.service.js';
import { getJobsByUser } from '../services/ai.service.js';

export const changeRequestRoutes = Router();
changeRequestRoutes.use(authenticate, requirePermission(Permission.USE_LOGO_STUDIO));

changeRequestRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const jobs = await getJobsByUser(req.user!.uid);
    sendSuccess(res, {
      changeRequests: await listChangeRequests(req.user!.uid),
      availableJobs: jobs.filter((j) => j.imageUrl),
    });
  })
);

changeRequestRoutes.get(
  '/job/:jobId/versions',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const jobId = String(req.params.jobId);
    sendSuccess(res, { versions: await getVersionsForJob(jobId, req.user!.uid) });
  })
);

changeRequestRoutes.post(
  '/restore/:versionId',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const versionId = String(req.params.versionId);
    const version = await restoreVersion(versionId, req.user!.uid);
    if (!version) throw new AppError(404, 'NOT_FOUND', 'Version nicht gefunden');
    sendSuccess(res, { version });
  })
);

const createSchema = z.object({
  jobId: z.string().uuid(),
  request: z.string().min(3).max(500),
});

changeRequestRoutes.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = createSchema.parse(req.body);
    try {
      const cr = await createChangeRequest(req.user!.uid, body.jobId, body.request);
      sendSuccess(res, { changeRequest: cr }, 201);
    } catch (err) {
      throw new AppError(400, 'CHANGE_FAILED', err instanceof Error ? err.message : 'Fehler');
    }
  })
);

changeRequestRoutes.get(
  '/:id/compare',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const comparison = await compareVersions(id, req.user!.uid);
    if (!comparison) throw new AppError(404, 'NOT_FOUND', 'Vergleich nicht verfügbar');
    sendSuccess(res, { comparison });
  })
);

changeRequestRoutes.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const cr = await getChangeRequest(id, req.user!.uid);
    if (!cr) throw new AppError(404, 'NOT_FOUND', 'Änderungswunsch nicht gefunden');
    sendSuccess(res, { changeRequest: cr });
  })
);
