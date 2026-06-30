import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  listLayouts,
  getLayout,
  createLayout,
  updateLayout,
  deleteLayout,
  exportLayout,
} from '../services/layout.service.js';
import { getActiveDna } from '../services/dna.service.js';

export const layoutRoutes = Router();
layoutRoutes.use(authenticate, requirePermission(Permission.USE_LAYOUT_STUDIO));

layoutRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, { layouts: await listLayouts(req.user!.uid) });
  })
);

layoutRoutes.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const layout = await getLayout(id, req.user!.uid);
    if (!layout) throw new AppError(404, 'NOT_FOUND', 'Layout nicht gefunden');
    sendSuccess(res, { layout });
  })
);

const layoutElementSchema = z.object({
  id: z.string(),
  type: z.enum(['facecam', 'chatbox', 'alert', 'widget', 'logo', 'text', 'image', 'frame', 'overlay']),
  x: z.number(),
  y: z.number(),
  width: z.number().min(20).max(3840),
  height: z.number().min(20).max(2160),
  label: z.string().optional(),
  color: z.string().optional(),
  imageUrl: z.string().optional(),
  content: z.string().optional(),
  borderWidth: z.number().optional(),
  borderRadius: z.number().optional(),
  borderColor: z.string().optional(),
  opacity: z.number().min(0).max(1).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(100),
  platform: z.enum(['obs', 'streamlabs', 'tiktok', 'twitch']),
  canvas: z.object({ width: z.number(), height: z.number() }).optional(),
  elements: z.array(layoutElementSchema).optional(),
});

layoutRoutes.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = createSchema.parse(req.body);
    const activeDna = await getActiveDna(req.user!.uid);

    const layout = await createLayout(req.user!.uid, {
      name: body.name,
      platform: body.platform,
      canvas: body.canvas ?? { width: 1920, height: 1080 },
      elements: body.elements ?? [],
      dnaId: activeDna?.id,
    });

    sendSuccess(res, { layout }, 201);
  })
);

layoutRoutes.patch(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const layout = await updateLayout(id, req.user!.uid, req.body);
    if (!layout) throw new AppError(404, 'NOT_FOUND', 'Layout nicht gefunden');
    sendSuccess(res, { layout });
  })
);

layoutRoutes.delete(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    if (!(await deleteLayout(id, req.user!.uid))) {
      throw new AppError(404, 'NOT_FOUND', 'Layout nicht gefunden');
    }
    sendSuccess(res, { deleted: true });
  })
);

layoutRoutes.post(
  '/:id/export',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const format = (req.body.format as 'obs' | 'streamlabs' | 'json') || 'obs';
    const layout = await getLayout(id, req.user!.uid);
    if (!layout) throw new AppError(404, 'NOT_FOUND', 'Layout nicht gefunden');
    sendSuccess(res, { export: exportLayout(layout, format), format });
  })
);
