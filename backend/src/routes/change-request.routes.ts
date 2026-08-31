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
  restoreVersion,
  compareVersions,
  getVersionsForJob,
  getOwnedJobForChange,
  changeModuleToQuoteKind,
} from '../services/change-request.service.js';
import { getJobsByUser } from '../services/ai.service.js';
import { createQuote } from '../services/nexter/quotes.service.js';
import { ServiceError } from '../lib/errors.js';

export const changeRequestRoutes = Router();
changeRequestRoutes.use(authenticate, requirePermission(Permission.USE_LOGO_STUDIO));

function mapErr(err: unknown): never {
  if (err instanceof AppError) throw err;
  if (err instanceof ServiceError) throw new AppError(err.statusCode, err.code, err.message);
  throw new AppError(400, 'CHANGE_FAILED', err instanceof Error ? err.message : 'Fehler');
}

changeRequestRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const jobs = await getJobsByUser(req.user!.uid);
    sendSuccess(res, {
      changeRequests: await listChangeRequests(req.user!.uid),
      availableJobs: jobs.filter((j) => j.imageUrl && changeModuleToQuoteKind(j.module)),
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

const quoteSchema = z.object({
  jobId: z.string().uuid(),
  request: z.string().min(3).max(500),
  projectId: z.string().min(1).max(80).optional(),
});

changeRequestRoutes.post(
  '/quote',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = quoteSchema.parse(req.body);
    try {
      const job = await getOwnedJobForChange(body.jobId, req.user!.uid);
      const kind = changeModuleToQuoteKind(job.module)!;
      const quote = await createQuote(req.user!.uid, kind, body.projectId || job.projectId, {
        changeRequest: true,
        jobId: job.id,
        request: body.request,
      });
      sendSuccess(res, {
        quote,
        module: kind,
        honestLabel: 'KI-Variante auf Basis des bestehenden Designs',
      });
    } catch (err) {
      mapErr(err);
    }
  })
);

changeRequestRoutes.post(
  '/',
  asyncHandler(async (_req: AuthenticatedRequest, res) => {
    throw new AppError(
      400,
      'CHANGE_REQUIRES_QUOTE',
      'Änderungswünsche starten nur nach Angebot und Bestätigung (Erstellen).'
    );
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
