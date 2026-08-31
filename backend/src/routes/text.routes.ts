import { Router } from 'express';
import { z } from 'zod';
import { Permission, TEXT_KINDS } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { ServiceError } from '../lib/errors.js';
import { createQuote } from '../services/nexter/quotes.service.js';
import {
  getContentPackage,
  listTextJobs,
  updateContentPackageFields,
  contentPackageExportText,
  createDraftPackage,
  restoreContentRevision,
  type TextQuotePayload,
} from '../services/text.service.js';

export const textRoutes = Router();
textRoutes.use(authenticate, requirePermission(Permission.USE_TEXT_STUDIO));

function mapErr(err: unknown): never {
  if (err instanceof AppError) throw err;
  if (err instanceof ServiceError) {
    throw new AppError(err.statusCode, err.code, err.message);
  }
  throw new AppError(400, 'TEXT_ERROR', err instanceof Error ? err.message : 'Text-Fehler');
}

const quotePayloadSchema = z.object({
  kind: z.enum(TEXT_KINDS).optional(),
  topic: z.string().max(2000).optional(),
  projectId: z.string().max(80).optional(),
  sourceType: z
    .enum(['topic', 'project', 'video', 'short', 'highlight', 'transcript', 'image', 'logo', 'file'])
    .optional(),
  sourceAssetId: z.string().max(80).optional(),
  videoProjectId: z.string().max(80).optional(),
  shortJobId: z.string().max(80).optional(),
  highlightIndex: z.number().int().min(0).max(40).optional(),
  fileId: z.string().max(80).optional(),
  platforms: z
    .array(z.enum(['tiktok', 'youtube', 'youtube-shorts', 'instagram', 'twitch', 'discord']))
    .optional(),
  packageId: z.string().max(80).optional(),
  revisionField: z.enum(['hook', 'title', 'caption', 'description', 'hashtags', 'callToAction']).optional(),
  revisionInstruction: z.string().max(1000).optional(),
  variantCount: z.number().int().min(1).max(5).optional(),
  wantLastShort: z.boolean().optional(),
});

textRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccess(res, { jobs: await listTextJobs(req.user!.uid) });
  })
);

textRoutes.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const job = await getContentPackage(String(req.params.id), req.user!.uid);
    if (!job) throw new AppError(404, 'NOT_FOUND', 'Content-Paket nicht gefunden');
    sendSuccess(res, { job });
  })
);

textRoutes.get(
  '/:id/export',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const job = await getContentPackage(String(req.params.id), req.user!.uid);
    if (!job) throw new AppError(404, 'NOT_FOUND', 'Content-Paket nicht gefunden');
    sendSuccess(res, {
      filename: `${(job.title || job.topic || 'content').slice(0, 40)}.txt`,
      text: contentPackageExportText(job),
      mimeType: 'text/plain',
    });
  })
);

textRoutes.patch(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        hook: z.string().max(2000).optional(),
        title: z.string().max(500).optional(),
        caption: z.string().max(4000).optional(),
        description: z.string().max(8000).optional(),
        hashtags: z.array(z.string().max(80)).max(40).optional(),
        callToAction: z.string().max(500).optional(),
        topic: z.string().max(2000).optional(),
        projectId: z.string().max(80).optional(),
      })
      .parse(req.body);
    try {
      const job = await updateContentPackageFields(String(req.params.id), req.user!.uid, body);
      sendSuccess(res, { job });
    } catch (err) {
      mapErr(err);
    }
  })
);

textRoutes.post(
  '/:id/restore-revision',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z.object({ revisionIndex: z.number().int().min(0).max(500) }).parse(req.body);
    try {
      const job = await restoreContentRevision(String(req.params.id), req.user!.uid, body.revisionIndex);
      sendSuccess(res, { job });
    } catch (err) {
      mapErr(err);
    }
  })
);

textRoutes.post(
  '/draft',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = quotePayloadSchema.parse(req.body);
    if (!body.topic && body.sourceType === 'topic') {
      throw new AppError(400, 'NO_TOPIC', 'Thema angeben');
    }
    try {
      const job = await createDraftPackage(req.user!.uid, {
        ...body,
        topic: body.topic || 'Entwurf',
      } as TextQuotePayload);
      sendSuccess(res, { job }, 201);
    } catch (err) {
      mapErr(err);
    }
  })
);

textRoutes.post(
  '/quote',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = quotePayloadSchema.parse(req.body);
    try {
      const quote = await createQuote(
        req.user!.uid,
        'text',
        body.projectId,
        body as unknown as Record<string, unknown>
      );
      sendSuccess(res, { quote });
    } catch (err) {
      mapErr(err);
    }
  })
);

textRoutes.post(
  '/',
  asyncHandler(async (_req: AuthenticatedRequest, res) => {
    throw new AppError(
      400,
      'TEXT_REQUIRES_QUOTE',
      'Textgenerierung startet nur nach Angebot und Bestätigung (Erstellen).'
    );
  })
);
