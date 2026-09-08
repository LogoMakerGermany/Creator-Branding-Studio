import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { Permission } from '@ucbs/shared';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  getCoinBalance,
  listOwnedTransactions,
  getPublicCoinCatalog,
  COIN_PACKAGES,
} from '../services/coins.service.js';
import { listOwnedQuotes } from '../services/nexter/quotes.service.js';
import {
  listUserFiles,
  queryUserFilesForClient,
  issueFileDownloadUrl,
  saveUserFile,
  deleteUserFile,
  updateUserFile,
  toClientFile,
  getUserFile,
  getFileRelations,
  FILE_LIST_DEFAULT_LIMIT,
  type FileCategory,
} from '../services/file-cloud.service.js';
import { parseAndValidateDataUrl, parseAndValidateVideoDataUrl, MAX_FILES_PER_USER } from '../lib/upload-validation.js';
import { sanitizeZipEntryName } from '../lib/zip-store.js';
import { getProject } from '../services/project.service.js';
import { attachAssetToProject } from '../services/project-assets.service.js';
import { ServiceError } from '../lib/errors.js';

function createFileCloudRoutes() {
  const router = Router();
  router.use(authenticate, requirePermission(Permission.UPLOAD_FILES));

  const listQuery = z.object({
    projectId: z.string().max(80).optional(),
    q: z.string().max(200).optional(),
    category: z.enum(['logo', 'banner', 'video', 'project', 'overlay', 'sticker', 'other', 'all']).optional(),
    kind: z.enum(['all', 'image', 'video', 'audio', 'other']).optional(),
    source: z.enum(['upload', 'generation']).optional(),
    sort: z.enum(['newest', 'oldest', 'name', 'name-desc', 'size']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  });

  router.get(
    '/',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const query = listQuery.parse(req.query);
      const page = await queryUserFilesForClient(req.user!.uid, {
        projectId: query.projectId,
        q: query.q,
        category: query.category === 'all' ? undefined : query.category,
        kind: query.kind,
        source: query.source,
        sort: query.sort,
        limit: query.limit ?? FILE_LIST_DEFAULT_LIMIT,
        offset: query.offset ?? 0,
      });
      sendSuccess(res, {
        files: page.files,
        total: page.total,
        counts: page.counts,
        limit: query.limit ?? FILE_LIST_DEFAULT_LIMIT,
        offset: query.offset ?? 0,
      });
    })
  );

  router.get(
    '/:id/download-url',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const issued = await issueFileDownloadUrl(String(req.params.id), req.user!.uid);
      if (!issued) throw new AppError(404, 'NOT_FOUND', 'Datei nicht gefunden');
      sendSuccess(res, {
        downloadUrl: issued.downloadUrl,
        expiresAt: issued.expiresAt,
        expiresInMs: issued.expiresInMs,
      });
    })
  );

  router.get(
    '/:id',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const fileId = String(req.params.id);
      const userId = req.user!.uid;
      const record = await getUserFile(fileId, userId);
      if (!record) throw new AppError(404, 'NOT_FOUND', 'Datei nicht gefunden');
      const relations = await getFileRelations(fileId, userId);
      try {
        const issued = await issueFileDownloadUrl(fileId, userId);
        if (!issued) throw new AppError(404, 'NOT_FOUND', 'Datei nicht gefunden');
        sendSuccess(res, {
          file: { ...issued.file, dataUrl: issued.downloadUrl },
          expiresAt: issued.expiresAt,
          expiresInMs: issued.expiresInMs,
          usage: relations.usage,
          versions: relations.versions,
          references: relations.references,
        });
      } catch (err) {
        if (err instanceof ServiceError && err.code === 'FILE_MISSING') {
          sendSuccess(res, {
            file: toClientFile(record, undefined, { missing: true }),
            usage: relations.usage,
            versions: relations.versions,
            references: relations.references,
          });
          return;
        }
        throw err;
      }
    })
  );

  const uploadSchema = z.object({
    name: z.string().min(1).max(200),
    mimeType: z.string().min(1).max(100).optional(),
    category: z.enum(['logo', 'banner', 'video', 'project', 'overlay', 'sticker', 'other']),
    dataUrl: z.string().min(20),
    projectId: z.string().min(1).max(80).optional(),
    rightsConfirmed: z.literal(true),
  });

  router.post(
    '/',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const body = uploadSchema.parse(req.body);
      const userId = req.user!.uid;

      if ((await listUserFiles(userId)).length >= MAX_FILES_PER_USER) {
        throw new AppError(413, 'QUOTA_EXCEEDED', `Maximal ${MAX_FILES_PER_USER} Dateien pro Nutzer`);
      }

      if (body.projectId) {
        const project = await getProject(body.projectId, userId);
        if (!project) throw new AppError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
      }

      const validated =
        body.category === 'video'
          ? parseAndValidateVideoDataUrl(body.dataUrl.trim())
          : parseAndValidateDataUrl(body.dataUrl.trim());
      const safeName = sanitizeZipEntryName(body.name);

      const file = await saveUserFile(userId, {
        name: safeName,
        mimeType: validated.mimeType,
        category: body.category as FileCategory,
        dataUrl: body.dataUrl.trim(),
        source: 'upload',
        projectId: body.projectId,
      });
      if (body.projectId && file.downloadUrl) {
        await attachAssetToProject(userId, body.projectId, {
          name: file.name,
          type: file.category,
          url: file.downloadUrl,
          fileId: file.id,
          mimeType: file.mimeType,
          size: file.size,
          sourceType: 'file',
        });
      }
      sendSuccess(res, { file: toClientFile(file, file.downloadUrl) }, 201);
    })
  );

  const patchSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    projectId: z.string().max(80).nullable().optional(),
  });

  router.patch(
    '/:id',
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const body = patchSchema.parse(req.body);
      try {
        if (body.projectId) {
          const project = await getProject(body.projectId, req.user!.uid);
          if (!project) throw new AppError(404, 'NOT_FOUND', 'Projekt nicht gefunden');
        }
        const file = await updateUserFile(String(req.params.id), req.user!.uid, {
          name: body.name,
          projectId: body.projectId,
        });
        if (body.projectId && file.downloadUrl) {
          await attachAssetToProject(req.user!.uid, body.projectId, {
            name: file.name,
            type: file.category,
            url: file.downloadUrl,
            fileId: file.id,
            mimeType: file.mimeType,
            size: file.size,
            sourceType: 'file',
          });
        }
        const minted = await issueFileDownloadUrl(file.id, req.user!.uid).catch(() => null);
        sendSuccess(res, {
          file: minted?.file ?? toClientFile(file),
          expiresAt: minted?.expiresAt,
          expiresInMs: minted?.expiresInMs,
        });
      } catch (err) {
        if (err instanceof AppError) throw err;
        if (err instanceof ServiceError) throw new AppError(err.statusCode, err.code, err.message);
        throw err;
      }
    })
  );

  router.delete(
    '/:id',
    requirePermission(Permission.MANAGE_FILES),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      try {
        const deleted = await deleteUserFile(String(req.params.id), req.user!.uid);
        if (!deleted) throw new AppError(404, 'NOT_FOUND', 'Datei nicht gefunden');
        sendSuccess(res, { deleted: true });
      } catch (err) {
        if (err instanceof AppError) throw err;
        if (err instanceof ServiceError) throw new AppError(err.statusCode, err.code, err.message);
        throw err;
      }
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
    const userId = req.user!.uid;
    const balance = await getCoinBalance(userId);
    sendSuccess(res, { balance, userId });
  })
);

coinsRoutes.get(
  '/transactions',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const offset = typeof req.query.offset === 'string' ? Number(req.query.offset) : undefined;
    const page = await listOwnedTransactions(userId, { limit, offset });
    sendSuccess(res, page);
  })
);

coinsRoutes.get(
  '/catalog',
  authenticate,
  asyncHandler(async (_req: AuthenticatedRequest, res) => {
    sendSuccess(res, { catalog: getPublicCoinCatalog() });
  })
);

coinsRoutes.get(
  '/quotes',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const now = Date.now();
    const quotes = (await listOwnedQuotes(userId, 20)).map((quote) => ({
      id: quote.id,
      kind: quote.kind,
      coinCost: quote.coinCost,
      status: quote.status,
      createdAt: quote.createdAt,
      expiresAt: quote.expiresAt,
      projectId: quote.projectId,
      expired: Date.parse(quote.expiresAt) <= now,
    }));
    sendSuccess(res, { quotes });
  })
);

coinsRoutes.get(
  '/packages',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { packages: COIN_PACKAGES });
  })
);
