import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  listUltimateProjects,
  getUltimateProject,
  runUltimateCreatorPack,
  markProjectExported,
} from '../services/ultimate-creator/index.js';
import { ServiceError } from '../lib/errors.js';

export const ultimateCreatorRoutes = Router();
ultimateCreatorRoutes.use(authenticate);

function mapError(err: unknown): never {
  if (err instanceof ServiceError) {
    throw new AppError(err.statusCode, err.code, err.message);
  }
  throw err;
}

ultimateCreatorRoutes.get(
  '/projects',
  requirePermission(Permission.VIEW_DNA),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const projects = await listUltimateProjects(req.user!.uid);
    sendSuccess(res, { projects });
  })
);

ultimateCreatorRoutes.get(
  '/projects/:id',
  requirePermission(Permission.VIEW_DNA),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const project = await getUltimateProject(String(req.params.id), req.user!.uid);
    if (!project) throw new AppError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
    sendSuccess(res, { project });
  })
);

const wizardSchema = z.object({
  name: z.string().min(2).max(80),
  clanName: z.string().max(80).optional(),
  game: z.string().max(80).optional(),
  style: z.string().min(1).max(40),
  colors: z.array(z.string()).min(1).max(6),
  platforms: z.array(z.enum(['twitch', 'youtube', 'tiktok', 'discord', 'kick'])).min(1),
});

ultimateCreatorRoutes.post(
  '/create',
  requirePermission(Permission.USE_BANNER_STUDIO),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const wizard = wizardSchema.parse(req.body);
    try {
      const result = await runUltimateCreatorPack(req.user!.uid, wizard);
      sendSuccess(res, result, 201);
    } catch (err) {
      mapError(err);
    }
  })
);

ultimateCreatorRoutes.post(
  '/projects/:id/export',
  requirePermission(Permission.VIEW_DNA),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const project = await getUltimateProject(String(req.params.id), req.user!.uid);
    if (!project) throw new AppError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
    const platform = z.string().parse(req.body?.platform ?? 'all');
    const updated = await markProjectExported(project, platform);
    sendSuccess(res, { project: updated });
  })
);
