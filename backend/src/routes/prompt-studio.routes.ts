import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { getActiveDna } from '../services/dna.service.js';
import {
  generateAndSavePromptSet,
  listPromptSets,
  getPromptSet,
  deletePromptSet,
  buildProviderPromptPack,
} from '../services/prompt-studio.service.js';

export const promptStudioRoutes = Router();
promptStudioRoutes.use(authenticate, requirePermission(Permission.USE_AI_ASSISTANT));

promptStudioRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const sets = await listPromptSets(req.user!.uid);
    sendSuccess(res, { sets });
  })
);

const generateSchema = z.object({
  title: z.string().min(1).max(120),
  purpose: z.string().min(1).max(200),
  topic: z.string().max(500).optional(),
  save: z.boolean().optional().default(true),
});

promptStudioRoutes.post(
  '/generate',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = generateSchema.parse(req.body);
    const dna = await getActiveDna(req.user!.uid);
    if (!dna) throw new AppError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');

    if (body.save) {
      const set = await generateAndSavePromptSet(req.user!.uid, dna, body);
      sendSuccess(res, { set, providers: set.providers }, 201);
      return;
    }

    const providers = buildProviderPromptPack(dna, body.purpose, body.topic);
    sendSuccess(res, { providers });
  })
);

promptStudioRoutes.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const set = await getPromptSet(String(req.params.id), req.user!.uid);
    if (!set) throw new AppError(404, 'NOT_FOUND', 'Prompt-Set nicht gefunden');
    sendSuccess(res, { set });
  })
);

promptStudioRoutes.delete(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const ok = await deletePromptSet(String(req.params.id), req.user!.uid);
    if (!ok) throw new AppError(404, 'NOT_FOUND', 'Prompt-Set nicht gefunden');
    sendSuccess(res, { deleted: true });
  })
);
