import { Router } from 'express';
import { z } from 'zod';
import { Permission, coinCostForStreamsetSelection } from '@ucbs/shared';
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
  listChangeableSources,
  resolveChangeSource,
  sanitizeChangeText,
} from '../services/change-request.service.js';
import { getJobsByUser } from '../services/ai.service.js';
import { createQuote } from '../services/nexter/quotes.service.js';
import { ServiceError } from '../lib/errors.js';

export const changeRequestRoutes = Router();
changeRequestRoutes.use(authenticate, requirePermission(Permission.USE_LOGO_STUDIO));

const PARENT_QUOTE_KINDS = new Set(['facecam', 'overlay', 'sticker', 'mockup', 'animation', 'music', 'voice']);

function mapErr(err: unknown): never {
  if (err instanceof AppError) throw err;
  if (err instanceof ServiceError) throw new AppError(err.statusCode, err.code, err.message);
  throw new AppError(400, 'CHANGE_FAILED', err instanceof Error ? err.message : 'Fehler');
}

changeRequestRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const [jobs, sources, changeRequests] = await Promise.all([
      getJobsByUser(userId),
      listChangeableSources(userId),
      listChangeRequests(userId),
    ]);
    sendSuccess(res, {
      changeRequests,
      sources,
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
  jobId: z.string().uuid().optional(),
  fileId: z.string().uuid().optional(),
  projectAssetId: z.string().min(1).max(80).optional(),
  request: z.string().min(1).max(2000),
  projectId: z.string().min(1).max(80).optional(),
  scope: z.enum(['asset', 'set', 'dna']).optional(),
});

changeRequestRoutes.post(
  '/quote',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = quoteSchema.parse(req.body);
    try {
      const request = sanitizeChangeText(body.request);
      const scope = body.scope ?? 'asset';
      if (scope === 'dna') {
        throw new AppError(
          400,
          'DNA_CONFIRMATION_REQUIRED',
          'DNA-Änderungen laufen nur nach expliziter Bestätigung in der Creator DNA — nicht als Asset-Änderung.'
        );
      }

      const source = await resolveChangeSource(req.user!.uid, {
        jobId: body.jobId,
        fileId: body.fileId,
        projectAssetId: body.projectAssetId,
        projectId: body.projectId,
      });

      if (source.module === 'video' || source.kind === 'captions') {
        if (!/transkrib|untertitel|caption|automatisch/i.test(request)) {
          throw new AppError(
            400,
            'CHANGE_NOT_SUPPORTED',
            'Lokale Videoschnitt-Änderungen laufen im Video Studio ohne Coins. Automatische Untertitel brauchen ein Angebot.'
          );
        }
        const quote = await createQuote(req.user!.uid, 'captions', body.projectId || source.projectId, {
          changeRequest: true,
          jobId: source.id,
          videoProjectId: source.id,
          request,
          reviewRequired: true,
        });
        sendSuccess(res, {
          quote,
          module: 'captions',
          source,
          honestLabel: 'Automatische Untertitel — Angebot, erst nach Bestätigung',
        });
        return;
      }

      if (scope === 'set' || source.kind === 'streamset' || source.batchId) {
        const jobs = await getJobsByUser(req.user!.uid);
        const batchId = source.batchId || source.id;
        const keys = [
          ...new Set(
            jobs
              .filter((j) => j.batchId === batchId && j.assetKey && j.imageUrl)
              .map((j) => j.assetKey as string)
          ),
        ];
        const selectedKeys = scope === 'asset' && source.assetKey ? [source.assetKey] : keys;
        if (!selectedKeys.length) {
          throw new AppError(400, 'CHANGE_NOT_SUPPORTED', 'Keine Streamset-Assets für diese Änderung gefunden.');
        }
        const pricing = coinCostForStreamsetSelection(selectedKeys);
        const quote = await createQuote(
          req.user!.uid,
          'streamset',
          body.projectId || source.projectId,
          {
            changeRequest: true,
            jobId: batchId,
            request,
            selectedKeys,
            scope: selectedKeys.length > 1 ? 'set' : 'asset',
          },
          pricing.total
        );
        sendSuccess(res, {
          quote,
          module: 'streamset',
          source,
          honestLabel:
            selectedKeys.length > 1
              ? 'KI-Variante für die zugehörigen Streamset-Assets (nicht die Creator DNA)'
              : 'KI-Variante nur für dieses Streamset-Asset',
        });
        return;
      }

      if (IMAGE_NEEDS_JOB(source.kind)) {
        await getOwnedJobForChange(source.id, req.user!.uid);
      }

      const payload: Record<string, unknown> = {
        changeRequest: true,
        jobId: source.id,
        request,
        scope: 'asset',
      };
      if (PARENT_QUOTE_KINDS.has(source.kind)) payload.parentJobId = source.id;

      const quote = await createQuote(req.user!.uid, source.kind, body.projectId || source.projectId, payload);
      sendSuccess(res, {
        quote,
        module: source.kind,
        source,
        honestLabel: 'KI-Variante auf Basis des bestehenden Designs',
      });
    } catch (err) {
      mapErr(err);
    }
  })
);

function IMAGE_NEEDS_JOB(kind: string): boolean {
  return ['logo', 'banner', 'facecam', 'overlay', 'sticker'].includes(kind);
}

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
