import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  getStreamConfig,
  updateStreamConfig,
  regenerateStreamKey,
  listStreamSessions,
  createStreamSession,
  getStreamSession,
  updateChecklist,
  startStream,
  endStream,
  getActiveSession,
} from '../services/live-stream.service.js';

export const liveStreamRoutes = Router();
liveStreamRoutes.use(authenticate, requirePermission(Permission.USE_LIVE_STREAMING));

liveStreamRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, {
      config: await getStreamConfig(req.user!.uid),
      sessions: await listStreamSessions(req.user!.uid),
      activeSession: await getActiveSession(req.user!.uid),
    });
  })
);

const configSchema = z.object({
  platforms: z.array(z.enum(['twitch', 'youtube', 'tiktok', 'kick', 'facebook'])).optional(),
  overlayPackEnabled: z.boolean().optional(),
  alertsEnabled: z.boolean().optional(),
  chatOverlayEnabled: z.boolean().optional(),
  multistreamEnabled: z.boolean().optional(),
});

liveStreamRoutes.patch(
  '/config',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = configSchema.parse(req.body);
    const config = await updateStreamConfig(req.user!.uid, body);
    sendSuccess(res, { config });
  })
);

liveStreamRoutes.post(
  '/config/regenerate-key',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const config = await regenerateStreamKey(req.user!.uid);
    sendSuccess(res, { config });
  })
);

const sessionSchema = z.object({
  title: z.string().min(1).max(200),
  platforms: z.array(z.enum(['twitch', 'youtube', 'tiktok', 'kick', 'facebook'])).optional(),
});

liveStreamRoutes.post(
  '/sessions',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = sessionSchema.parse(req.body);
    const session = await createStreamSession(req.user!.uid, body.title, body.platforms);
    sendSuccess(res, { session }, 201);
  })
);

liveStreamRoutes.get(
  '/sessions/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const session = await getStreamSession(String(req.params.id), req.user!.uid);
    if (!session) throw new AppError(404, 'NOT_FOUND', 'Session nicht gefunden');
    sendSuccess(res, { session });
  })
);

liveStreamRoutes.patch(
  '/sessions/:id/checklist',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { itemId, done } = req.body;
    if (!itemId) throw new AppError(400, 'INVALID', 'itemId erforderlich');
    try {
      const session = await updateChecklist(String(req.params.id), req.user!.uid, itemId, Boolean(done));
      sendSuccess(res, { session });
    } catch {
      throw new AppError(404, 'NOT_FOUND', 'Session nicht gefunden');
    }
  })
);

liveStreamRoutes.post(
  '/sessions/:id/start',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const session = await startStream(String(req.params.id), req.user!.uid);
      sendSuccess(res, { session });
    } catch {
      throw new AppError(404, 'NOT_FOUND', 'Session nicht gefunden');
    }
  })
);

liveStreamRoutes.post(
  '/sessions/:id/end',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const session = await endStream(String(req.params.id), req.user!.uid);
      sendSuccess(res, { session });
    } catch {
      throw new AppError(404, 'NOT_FOUND', 'Session nicht gefunden');
    }
  })
);
