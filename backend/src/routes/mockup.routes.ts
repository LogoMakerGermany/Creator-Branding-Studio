import { Router } from 'express';
import { z } from 'zod';
import { MOCKUP_CATEGORIES, Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  generateCompositeMockup,
  listMockups,
  saveMockupToFiles,
  saveMockupToProject,
} from '../services/mockup.service.js';
import { ServiceError } from '../lib/errors.js';

export const mockupRoutes = Router();
mockupRoutes.use(authenticate, requirePermission(Permission.USE_MOCKUP_STUDIO));

function mapErr(err: unknown): never {
  if (err instanceof ServiceError) throw new AppError(err.statusCode, err.code, err.message);
  throw err;
}

mockupRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, { jobs: await listMockups(req.user!.uid) });
  })
);

mockupRoutes.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        category: z.enum(['mug', 'tshirt', 'hoodie', 'cap', 'phone', 'poster', 'tote']),
        colorId: z.string().min(1).max(20),
        modelLabel: z.string().min(1).max(80),
        placement: z.enum(['front', 'wrap', 'corner', 'center']),
        scalePercent: z.number().min(40).max(140),
        designUrl: z.string().min(1),
        lifestyle: z.boolean().optional(),
        projectId: z.string().min(1).optional(),
      })
      .parse(req.body);

    if (body.lifestyle) {
      throw new AppError(
        400,
        'LIFESTYLE_REQUIRES_QUOTE',
        'Lifestyle-AI startet nur über Nexter nach Bestätigung (Erstellen).'
      );
    }

    try {
      const job = await generateCompositeMockup(req.user!.uid, {
        ...body,
        category: body.category as (typeof MOCKUP_CATEGORIES)[number]['id'],
        lifestyle: false,
      });
      sendSuccess(res, { job }, 201);
    } catch (err) {
      mapErr(err);
    }
  })
);

mockupRoutes.post(
  '/:id/save-file',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const file = await saveMockupToFiles(req.user!.uid, String(req.params.id));
      sendSuccess(res, { file }, 201);
    } catch (err) {
      mapErr(err);
    }
  })
);

mockupRoutes.post(
  '/:id/save-project',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z.object({ projectId: z.string().min(1) }).parse(req.body);
    try {
      const result = await saveMockupToProject(req.user!.uid, String(req.params.id), body.projectId);
      sendSuccess(res, result, 201);
    } catch (err) {
      mapErr(err);
    }
  })
);
