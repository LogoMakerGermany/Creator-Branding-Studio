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
  listProjects,
  listTrash,
  getProject,
  createProject,
  updateProject,
  softDeleteProject,
  restoreProject,
  purgeProject,
  exportProjectZip,
  importProjectZip,
} from '../services/project.service.js';

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
]);

projectRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const projects = await listProjects(req.user!.uid);
    sendSuccess(res, { projects });
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
      })
      .parse(req.body);

    const dna = await getActiveDna(req.user!.uid);
    const project = await createProject(req.user!.uid, {
      ...body,
      dnaId: dna?.id,
    });
    sendSuccess(res, { project }, 201);
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
      })
      .parse(req.body);

    try {
      const project = await updateProject(String(req.params.id), req.user!.uid, body);
      sendSuccess(res, { project });
    } catch (err) {
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
