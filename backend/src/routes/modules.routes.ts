import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { Permission } from '@ucbs/shared';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  getCoinBalance,
  getTransactions,
  COIN_PACKAGES,
} from '../services/coins.service.js';
import {
  listUserFiles,
  getUserFileWithData,
  saveUserFile,
  deleteUserFile,
  type FileCategory,
} from '../services/file-cloud.service.js';
import { parseAndValidateDataUrl, parseAndValidateVideoDataUrl, MAX_FILES_PER_USER } from '../lib/upload-validation.js';

function createFileCloudRoutes() {
  const router = Router();
  router.use(authenticate, requirePermission(Permission.UPLOAD_FILES));

  router.get(
    '/',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      sendSuccess(res, { files: await listUserFiles(req.user!.uid) });
    })
  );

  router.get(
    '/:id',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const file = await getUserFileWithData(String(req.params.id), req.user!.uid);
      if (!file) throw new AppError(404, 'NOT_FOUND', 'Datei nicht gefunden');
      sendSuccess(res, { file });
    })
  );

  const uploadSchema = z.object({
    name: z.string().min(1).max(200),
    mimeType: z.string().min(1).max(100).optional(),
    category: z.enum(['logo', 'banner', 'video', 'project', 'overlay', 'sticker', 'other']),
    dataUrl: z.string().min(20),
  });

  router.post(
    '/',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const body = uploadSchema.parse(req.body);
      const userId = req.user!.uid;

      if ((await listUserFiles(userId)).length >= MAX_FILES_PER_USER) {
        throw new AppError(413, 'QUOTA_EXCEEDED', `Maximal ${MAX_FILES_PER_USER} Dateien pro Nutzer`);
      }

      const validated =
        body.category === 'video'
          ? parseAndValidateVideoDataUrl(body.dataUrl.trim())
          : parseAndValidateDataUrl(body.dataUrl.trim());
      const safeName = body.name.replace(/[^\w.\-()+\s]/g, '_').slice(0, 200);

      const file = await saveUserFile(userId, {
        name: safeName,
        mimeType: validated.mimeType,
        category: body.category as FileCategory,
        dataUrl: body.dataUrl.trim(),
        source: 'upload',
      });
      sendSuccess(res, { file }, 201);
    })
  );

  router.delete(
    '/:id',
    requirePermission(Permission.MANAGE_FILES),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const deleted = await deleteUserFile(String(req.params.id), req.user!.uid);
      if (!deleted) throw new AppError(404, 'NOT_FOUND', 'Datei nicht gefunden');
      sendSuccess(res, { deleted: true });
    })
  );

  return router;
}

export const filesRoutes = createFileCloudRoutes();

export const coinsRoutes = Router();

coinsRoutes.get(
  '/balance',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const balance = await getCoinBalance(req.user!.uid);
    sendSuccess(res, { balance, userId: req.user!.uid });
  })
);

coinsRoutes.get(
  '/transactions',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const transactions = await getTransactions(req.user!.uid);
    sendSuccess(res, { transactions });
  })
);

coinsRoutes.get(
  '/packages',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { packages: COIN_PACKAGES });
  })
);
