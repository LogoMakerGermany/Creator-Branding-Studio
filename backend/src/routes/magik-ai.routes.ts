import { Router } from 'express';
import { z } from 'zod';
import {
  MAGIK_AI_ASSISTANT_ENABLED,
  MAGIK_AI_PHASE,
  DEFAULT_MAGIK_AI_SETTINGS,
  MAGIK_AI_PERSONALITIES,
} from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, sendSuccess } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  magikAvatarService,
  magikConversationService,
  magikMemoryService,
  magikRecommendationService,
  listMagikLogoContexts,
} from '../services/magik-ai/index.js';
import { getMagikAiSettings, saveMagikAiSettings } from '../services/magik-ai/settings.service.js';

export const magikAiRoutes = Router();
magikAiRoutes.use(authenticate);

magikAiRoutes.get(
  '/status',
  asyncHandler(async (_req: AuthenticatedRequest, res) => {
    sendSuccess(res, {
      phase: MAGIK_AI_PHASE,
      enabled: MAGIK_AI_ASSISTANT_ENABLED,
      message: 'MAGIK AI Assistant — Vorbereitungsphase. Aktivierung in Phase 2.',
    });
  })
);

magikAiRoutes.get(
  '/settings',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const settings = await getMagikAiSettings(req.user!.uid);
    sendSuccess(res, {
      settings,
      defaults: DEFAULT_MAGIK_AI_SETTINGS,
      personalities: MAGIK_AI_PERSONALITIES,
      locked: true,
    });
  })
);

const settingsSchema = z.object({
  personalityId: z.enum(['mentor', 'hype', 'strategist', 'creative', 'custom']).optional(),
  language: z.string().min(2).max(10).optional(),
});

magikAiRoutes.put(
  '/settings',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = settingsSchema.parse(req.body);
    const settings = await saveMagikAiSettings(req.user!.uid, body);
    sendSuccess(res, { settings, locked: true });
  })
);

magikAiRoutes.get(
  '/logo-context',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const contexts = await listMagikLogoContexts(req.user!.uid, 20);
    sendSuccess(res, { contexts });
  })
);

/** Platzhalter-Endpunkte — Services ohne KI-Logik. */
magikAiRoutes.get(
  '/avatar',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, { avatar: await magikAvatarService.getAvatar(req.user!.uid) });
  })
);

magikAiRoutes.get(
  '/memory',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, {
      status: await magikMemoryService.getStatus(req.user!.uid),
      entries: await magikMemoryService.listEntries(req.user!.uid),
    });
  })
);

magikAiRoutes.get(
  '/recommendations',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, {
      items: await magikRecommendationService.getRecommendations(req.user!.uid),
    });
  })
);

magikAiRoutes.get(
  '/conversation',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, {
      session: await magikConversationService.getSession(req.user!.uid),
    });
  })
);
