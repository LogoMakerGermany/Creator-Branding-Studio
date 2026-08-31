import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  generateStreamsetPack,
  generateStreamsetAsset,
  getStreamsetStatus,
  exportStreamsetZip,
} from '../services/streamset.service.js';
import { ServiceError } from '../lib/errors.js';

export const streamsetRoutes = Router();
streamsetRoutes.use(authenticate, requirePermission(Permission.USE_OVERLAY_STUDIO));

function mapErr(err: unknown): never {
  if (err instanceof ServiceError) throw new AppError(err.statusCode, err.code, err.message);
  throw err;
}

const projectBody = z.object({
  projectId: z.string().min(1).optional(),
});

streamsetRoutes.get(
  '/status',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    const status = await getStreamsetStatus(req.user!.uid, projectId);
    sendSuccess(res, status);
  })
);

streamsetRoutes.get(
  '/export',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    try {
      const result = await exportStreamsetZip(req.user!.uid, projectId);
      sendSuccess(res, result);
    } catch (err) {
      mapErr(err);
    }
  })
);

streamsetRoutes.post(
  '/pack',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = projectBody.parse(req.body ?? {});
    try {
      const result = await generateStreamsetPack(req.user!.uid, body.projectId);
      sendSuccess(res, result, 201);
    } catch (err) {
      mapErr(err);
    }
  })
);

streamsetRoutes.post(
  '/asset',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        assetKey: z.string().min(1).optional(),
        kind: z.enum(['overlay', 'banner', 'facecam', 'sticker']).optional(),
        projectId: z.string().min(1).optional(),
      })
      .refine((d) => Boolean(d.assetKey || d.kind), { message: 'assetKey oder kind erforderlich' })
      .parse(req.body);
    try {
      const result = await generateStreamsetAsset(req.user!.uid, body);
      sendSuccess(res, result, 201);
    } catch (err) {
      mapErr(err);
    }
  })
);
