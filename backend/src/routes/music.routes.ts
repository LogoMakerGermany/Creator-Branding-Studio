import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  downloadMusic,
  getMusic,
  listMusic,
  listMusicVersions,
  listOwnedMusicFiles,
  retryMusicJob,
} from '../services/music.service.js';
import { toClientFile } from '../services/file-cloud.service.js';

export const aiMusicRoutes = Router();
aiMusicRoutes.use(authenticate, requirePermission(Permission.USE_AI_MUSIC));

aiMusicRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, { jobs: await listMusic(req.user!.uid) });
  })
);

aiMusicRoutes.get(
  '/assets',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const files = await listOwnedMusicFiles(req.user!.uid);
    sendSuccess(res, { files: files.map((f) => toClientFile(f, f.downloadUrl)) });
  })
);

aiMusicRoutes.get(
  '/:id/download',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, await downloadMusic(String(req.params.id), req.user!.uid));
  })
);

aiMusicRoutes.get(
  '/:id/versions',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, { versions: await listMusicVersions(String(req.params.id), req.user!.uid) });
  })
);

aiMusicRoutes.post(
  '/:id/retry',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await retryMusicJob(String(req.params.id), req.user!.uid);
    sendSuccess(res, {});
  })
);

aiMusicRoutes.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const job = await getMusic(String(req.params.id), req.user!.uid);
    if (!job) throw new AppError(404, 'NOT_FOUND', 'Musik nicht gefunden');
    sendSuccess(res, { job });
  })
);

aiMusicRoutes.post(
  '/generate',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    z.object({}).passthrough().parse(req.body ?? {});
    throw new AppError(
      400,
      'MUSIC_REQUIRES_QUOTE',
      'Musik startet nur über Nexter nach Bestätigung (Für X Coins erstellen).'
    );
  })
);
