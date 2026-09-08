import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  downloadVoice,
  getVoice,
  listVoice,
  listVoiceVersions,
  listOwnedVoiceFiles,
  retryVoiceJob,
} from '../services/voice.service.js';
import { toClientFile } from '../services/file-cloud.service.js';

export const aiVoiceRoutes = Router();
aiVoiceRoutes.use(authenticate, requirePermission(Permission.USE_AI_VOICE));

aiVoiceRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, { jobs: await listVoice(req.user!.uid) });
  })
);

aiVoiceRoutes.get(
  '/assets',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const files = await listOwnedVoiceFiles(req.user!.uid);
    sendSuccess(res, { files: files.map((f) => toClientFile(f, f.downloadUrl)) });
  })
);

aiVoiceRoutes.get(
  '/:id/download',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, await downloadVoice(String(req.params.id), req.user!.uid));
  })
);

aiVoiceRoutes.get(
  '/:id/versions',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, { versions: await listVoiceVersions(String(req.params.id), req.user!.uid) });
  })
);

aiVoiceRoutes.post(
  '/:id/retry',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await retryVoiceJob(String(req.params.id), req.user!.uid);
    sendSuccess(res, {});
  })
);

aiVoiceRoutes.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const job = await getVoice(String(req.params.id), req.user!.uid);
    if (!job) throw new AppError(404, 'NOT_FOUND', 'Voice-Result nicht gefunden');
    sendSuccess(res, { job });
  })
);

aiVoiceRoutes.post(
  '/generate',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    z.object({}).passthrough().parse(req.body ?? {});
    throw new AppError(
      400,
      'VOICE_REQUIRES_QUOTE',
      'Voiceovers starten nur über Nexter nach Bestätigung (Für X Coins erstellen).'
    );
  })
);
