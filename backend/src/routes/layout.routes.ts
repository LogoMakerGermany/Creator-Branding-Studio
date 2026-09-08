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
  duplicateLayout,
  exportLayout,
  exportLayoutSvgFile,
  hydrateLayout,
} from '../services/layout.service.js';
import { getActiveDna } from '../services/dna.service.js';
import { ServiceError } from '../lib/errors.js';

export const layoutRoutes = Router();
layoutRoutes.use(authenticate, requirePermission(Permission.USE_LAYOUT_STUDIO));

function toAppError(err: unknown): never {
  if (err instanceof AppError) throw err;
  if (err instanceof ServiceError) throw new AppError(err.statusCode, err.code, err.message);
  throw err;
}

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
    sendSuccess(res, { layout: await hydrateLayout(layout, req.user!.uid) });
  })
);

const layoutElementSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.enum(['facecam', 'chatbox', 'alert', 'widget', 'logo', 'text', 'image', 'frame', 'overlay', 'gameplay']),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().min(20).max(3840),
  height: z.number().finite().min(20).max(2160),
  label: z.string().max(120).optional(),
  color: z.string().max(32).optional(),
  imageUrl: z.string().max(2_000_000).optional(),
  content: z.string().max(2000).optional(),
  borderWidth: z.number().finite().optional(),
  borderRadius: z.number().finite().optional(),
  borderColor: z.string().max(32).optional(),
  opacity: z.number().finite().min(0).max(1).optional(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  zIndex: z.number().finite().optional(),
  fontSize: z.number().finite().min(8).max(400).optional(),
  fontWeight: z.union([z.number().finite(), z.string().max(24)]).optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  fileId: z.string().min(1).max(80).optional(),
  sourceFacecamJobId: z.string().min(1).max(80).optional(),
  sourceOverlayJobId: z.string().min(1).max(80).optional(),
  sourceStickerJobId: z.string().min(1).max(80).optional(),
  sourceLogoJobId: z.string().min(1).max(80).optional(),
});

const canvasSchema = z.object({
  width: z.number().finite(),
  height: z.number().finite(),
});

const backgroundSchema = z.object({
  mode: z.enum(['transparent', 'solid']),
  color: z.string().max(32).optional(),
});

const platformSchema = z.enum(['obs', 'streamlabs', 'tiktok', 'twitch', 'youtube', 'custom']);

const createSchema = z.object({
  name: z.string().min(1).max(100),
  platform: platformSchema,
  canvas: canvasSchema.optional(),
  elements: z.array(layoutElementSchema).max(80).optional(),
  projectId: z.string().min(1).max(80).optional(),
  background: backgroundSchema.optional(),
});

layoutRoutes.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = createSchema.parse(req.body);
    const activeDna = await getActiveDna(req.user!.uid);
    try {
      const layout = await createLayout(req.user!.uid, {
        name: body.name,
        platform: body.platform,
        canvas: body.canvas ?? { width: 1920, height: 1080 },
        elements: body.elements ?? [],
        dnaId: activeDna?.id,
        projectId: body.projectId,
        background: body.background,
      });
      sendSuccess(res, { layout }, 201);
    } catch (err) {
      toAppError(err);
    }
  })
);

layoutRoutes.patch(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const body = z
      .object({
        name: z.string().min(1).max(100).optional(),
        platform: platformSchema.optional(),
        canvas: canvasSchema.optional(),
        elements: z.array(layoutElementSchema).max(80).optional(),
        projectId: z.string().max(80).nullable().optional(),
        background: backgroundSchema.optional(),
      })
      .parse(req.body ?? {});
    try {
      const layout = await updateLayout(id, req.user!.uid, {
        name: body.name,
        platform: body.platform,
        canvas: body.canvas,
        elements: body.elements,
        projectId: body.projectId === null ? undefined : body.projectId,
        background: body.background,
      });
      if (!layout) throw new AppError(404, 'NOT_FOUND', 'Layout nicht gefunden');
      sendSuccess(res, { layout });
    } catch (err) {
      toAppError(err);
    }
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
  '/:id/duplicate',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const copy = await duplicateLayout(String(req.params.id), req.user!.uid);
    if (!copy) throw new AppError(404, 'NOT_FOUND', 'Layout nicht gefunden');
    sendSuccess(res, { layout: await hydrateLayout(copy, req.user!.uid) }, 201);
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

layoutRoutes.post(
  '/:id/export-file',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const result = await exportLayoutSvgFile(String(req.params.id), req.user!.uid);
      sendSuccess(res, result);
    } catch (err) {
      toAppError(err);
    }
  })
);
