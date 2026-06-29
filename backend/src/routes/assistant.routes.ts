import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { ServiceError } from '../lib/errors.js';
import { getOrCreateSession, chat, clearSession } from '../services/assistant.service.js';

export const assistantRoutes = Router();
assistantRoutes.use(authenticate, requirePermission(Permission.USE_AI_ASSISTANT));

function mapAssistantError(err: unknown): never {
  if (err instanceof ServiceError) {
    throw new AppError(err.statusCode, err.code, err.message);
  }
  throw new AppError(400, 'ASSISTANT_ERROR', err instanceof Error ? err.message : 'Assistent-Fehler');
}

assistantRoutes.get(
  '/session',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, { session: await getOrCreateSession(req.user!.uid) });
  })
);

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
});

assistantRoutes.post(
  '/chat',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { message } = chatSchema.parse(req.body);
    try {
      const session = await chat(req.user!.uid, message);
      sendSuccess(res, { session });
    } catch (err) {
      mapAssistantError(err);
    }
  })
);

assistantRoutes.delete(
  '/session',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await clearSession(req.user!.uid);
    sendSuccess(res, { cleared: true });
  })
);
