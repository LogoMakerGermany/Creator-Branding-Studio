import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { ServiceError } from '../lib/errors.js';
import { getActiveDna } from '../services/dna.service.js';
import {
  listTrash,
  queryProjects,
  getProject,
  createProject,
  updateProject,
  softDeleteProject,
  restoreProject,
  purgeProject,
  importProjectZip,
  duplicateProject,
  archiveProject,
} from '../services/project.service.js';
import { exportProjectZip } from '../services/project-export.service.js';
import { getProjectOverview } from '../services/project-overview.service.js';
import {
  linkAssetToProject,
  listProjectAssets,
  setCurrentProjectAsset,
  unlinkAssetFromProject,
} from '../services/project-memory.service.js';

export const projectRoutes = Router();
projectRoutes.use(authenticate, requirePermission(Permission.MANAGE_PROJECTS));

const projectType = z.enum([
  'logo',
  'branding',
  'banner',
  'video',
  'intro',
  'overlay',
  'full_package',
  'custom',
  'streamset',
  'mockup',
  'shorts',
  'social',
  'text',
]);

const memoryFields = {
  platform: z.string().max(40).optional(),
  contentTopic: z.string().max(80).optional(),
  game: z.string().max(80).optional(),
  visualStyle: z.string().max(80).optional(),
  colors: z.array(z.string().max(80)).max(8).optional(),
  mascotChoice: z.string().max(80).optional(),
  aspectRatio: z.string().max(16).optional(),
  layoutPreference: z.string().max(80).optional(),
  notes: z.array(z.string().max(280)).max(8).optional(),
  decisions: z
    .array(
      z.object({
        id: z.string().max(80).optional(),
        text: z.string().min(1).max(280),
        createdAt: z.string().optional(),
      })
    )
    .max(12)
    .optional(),
};

const assetRole = z.enum([
  'logo',
  'banner',
  'facecam',
  'overlay',
  'starting_screen',
  'ending_screen',
  'pause_screen',
  'intro',
  'outro',
  'video',
  'thumbnail',
  'sticker',
  'badge',
  'audio',
  'layout',
  'other',
]);

projectRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const query = z
      .object({
        q: z.string().max(80).optional(),
        type: projectType.optional(),
        sort: z.enum(['updated', 'newest', 'oldest', 'name']).optional(),
        filter: z.enum(['active', 'archived']).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        offset: z.coerce.number().int().min(0).optional(),
      })
      .parse(req.query);
    const result = await queryProjects(req.user!.uid, query);
    sendSuccess(res, { projects: result.projects, total: result.total });
  })
);

projectRoutes.get(
  '/trash',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const projects = await listTrash(req.user!.uid);
    sendSuccess(res, { projects });
  })
);

projectRoutes.post(
  '/import',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        zipDataUrl: z.string().min(1),
        importDna: z.boolean().optional(),
        importCloud: z.boolean().optional(),
      })
      .parse(req.body);

    try {
      const result = await importProjectZip(req.user!.uid, body.zipDataUrl, {
        importDna: body.importDna,
        importCloud: body.importCloud,
      });
      sendSuccess(res, result, 201);
    } catch (err) {
      if (err instanceof ServiceError) {
        throw new AppError(err.statusCode, err.code, err.message);
      }
      throw new AppError(
        400,
        'IMPORT_FAILED',
        err instanceof Error ? err.message : 'Import fehlgeschlagen'
      );
    }
  })
);

projectRoutes.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        name: z.string().min(1).max(120),
        description: z.string().max(1000).optional(),
        type: projectType.default('custom'),
        dnaId: z.string().min(1).max(80).optional(),
        ...memoryFields,
      })
      .parse(req.body);

    const dna = await getActiveDna(req.user!.uid);
    try {
      const project = await createProject(req.user!.uid, {
        ...body,
        dnaId: body.dnaId ?? dna?.id,
      });
      sendSuccess(res, { project }, 201);
    } catch (err) {
      if (err instanceof ServiceError) throw new AppError(err.statusCode, err.code, err.message);
      throw err;
    }
  })
);

projectRoutes.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const project = await getProject(String(req.params.id), req.user!.uid);
    if (!project) throw new AppError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
    sendSuccess(res, { project });
  })
);

projectRoutes.get(
  '/:id/overview',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const overview = await getProjectOverview(String(req.params.id), req.user!.uid);
      sendSuccess(res, overview);
    } catch (err) {
      if (err instanceof ServiceError) throw new AppError(err.statusCode, err.code, err.message);
      throw new AppError(404, 'NOT_FOUND', err instanceof Error ? err.message : 'Projekt nicht gefunden');
    }
  })
);

projectRoutes.patch(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        name: z.string().min(1).max(120).optional(),
        description: z.string().max(1000).optional(),
        type: projectType.optional(),
        status: z
          .enum(['draft', 'in_progress', 'review', 'revision', 'completed', 'archived'])
          .optional(),
        dnaId: z.string().min(1).max(80).optional(),
        ...memoryFields,
      })
      .parse(req.body);

    try {
      const project = await updateProject(String(req.params.id), req.user!.uid, body);
      sendSuccess(res, { project });
    } catch (err) {
      if (err instanceof ServiceError) throw new AppError(err.statusCode, err.code, err.message);
      throw new AppError(404, 'NOT_FOUND', err instanceof Error ? err.message : 'Projekt nicht gefunden');
    }
  })
);

projectRoutes.delete(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const project = await softDeleteProject(String(req.params.id), req.user!.uid);
      sendSuccess(res, { project });
    } catch (err) {
      throw new AppError(404, 'NOT_FOUND', err instanceof Error ? err.message : 'Projekt nicht gefunden');
    }
  })
);

projectRoutes.post(
  '/:id/restore',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const project = await restoreProject(String(req.params.id), req.user!.uid);
      sendSuccess(res, { project });
    } catch (err) {
      throw new AppError(404, 'NOT_FOUND', err instanceof Error ? err.message : 'Projekt nicht gefunden');
    }
  })
);

projectRoutes.delete(
  '/:id/purge',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const ok = await purgeProject(String(req.params.id), req.user!.uid);
    if (!ok) throw new AppError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
    sendSuccess(res, { deleted: true });
  })
);

projectRoutes.post(
  '/:id/archive',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const project = await archiveProject(String(req.params.id), req.user!.uid);
      sendSuccess(res, { project });
    } catch (err) {
      if (err instanceof ServiceError) throw new AppError(err.statusCode, err.code, err.message);
      throw new AppError(404, 'NOT_FOUND', err instanceof Error ? err.message : 'Projekt nicht gefunden');
    }
  })
);

projectRoutes.get(
  '/:id/assets',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const assets = await listProjectAssets(req.user!.uid, String(req.params.id));
      sendSuccess(res, { assets });
    } catch (err) {
      if (err instanceof ServiceError) throw new AppError(err.statusCode, err.code, err.message);
      throw new AppError(404, 'NOT_FOUND', err instanceof Error ? err.message : 'Projekt nicht gefunden');
    }
  })
);

projectRoutes.post(
  '/:id/assets',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        name: z.string().min(1).max(120),
        type: z.string().max(40).optional(),
        url: z.string().max(500).optional(),
        fileId: z.string().min(1).max(80).optional(),
        jobId: z.string().min(1).max(80).optional(),
        module: z.string().max(40).optional(),
        assetKey: z.string().max(80).optional(),
        role: assetRole.optional(),
        makeCurrent: z.boolean().optional(),
      })
      .parse(req.body);
    try {
      const asset = await linkAssetToProject(req.user!.uid, String(req.params.id), body);
      sendSuccess(res, { asset }, 201);
    } catch (err) {
      if (err instanceof ServiceError) throw new AppError(err.statusCode, err.code, err.message);
      throw new AppError(400, 'LINK_FAILED', err instanceof Error ? err.message : 'Verknüpfung fehlgeschlagen');
    }
  })
);

projectRoutes.post(
  '/:id/assets/:assetId/current',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z.object({ role: assetRole.optional() }).parse(req.body ?? {});
    try {
      const project = await setCurrentProjectAsset(
        req.user!.uid,
        String(req.params.id),
        String(req.params.assetId),
        body.role
      );
      sendSuccess(res, { project });
    } catch (err) {
      if (err instanceof ServiceError) throw new AppError(err.statusCode, err.code, err.message);
      throw new AppError(404, 'NOT_FOUND', err instanceof Error ? err.message : 'Projekt nicht gefunden');
    }
  })
);

projectRoutes.delete(
  '/:id/assets/:assetId',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const project = await unlinkAssetFromProject(
        req.user!.uid,
        String(req.params.id),
        String(req.params.assetId)
      );
      sendSuccess(res, { project });
    } catch (err) {
      if (err instanceof ServiceError) throw new AppError(err.statusCode, err.code, err.message);
      throw new AppError(404, 'NOT_FOUND', err instanceof Error ? err.message : 'Projekt nicht gefunden');
    }
  })
);

projectRoutes.post(
  '/:id/duplicate',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const project = await duplicateProject(String(req.params.id), req.user!.uid);
      sendSuccess(res, { project }, 201);
    } catch (err) {
      throw new AppError(404, 'NOT_FOUND', err instanceof Error ? err.message : 'Projekt nicht gefunden');
    }
  })
);

projectRoutes.get(
  '/:id/export',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const result = await exportProjectZip(String(req.params.id), req.user!.uid);
      sendSuccess(res, result);
    } catch (err) {
      throw new AppError(404, 'NOT_FOUND', err instanceof Error ? err.message : 'Projekt nicht gefunden');
    }
  })
);
