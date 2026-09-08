import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  generateStreamsetPack,
  generateStreamsetAsset,
  getStreamsetStatus,
  exportStreamsetZip,
  previewStreamsetDraft,
  inspectStreamsetRetry,
  runTechnicalStreamsetRetry,
} from '../services/streamset.service.js';
import { confirmStreamsetQuote, quoteStreamsetDraft, quoteStreamsetRetry } from '../services/nexter/quotes.service.js';
import { ServiceError } from '../lib/errors.js';

export const streamsetRoutes = Router();
streamsetRoutes.use(authenticate, requirePermission(Permission.USE_OVERLAY_STUDIO));

function mapErr(err: unknown): never {
  if (err instanceof ServiceError) {
    throw new AppError(err.statusCode, err.code, err.message, err.details);
  }
  throw err;
}

const projectBody = z.object({
  projectId: z.string().min(1).optional(),
});

streamsetRoutes.get(
  '/status',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    const status = await getStreamsetStatus(req.user!.uid, projectId);
    sendSuccess(res, status);
  })
);

streamsetRoutes.get(
  '/export',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    try {
      const result = await exportStreamsetZip(req.user!.uid, projectId);
      sendSuccess(res, result);
    } catch (err) {
      mapErr(err);
    }
  })
);

streamsetRoutes.post(
  '/preview',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        projectId: z.string().min(1).optional(),
        platform: z.enum(['twitch', 'tiktok', 'youtube', 'discord']).optional(),
        selectedKeys: z.array(z.string().min(1)).optional(),
        selectedSlotIds: z.array(z.string().min(1)).optional(),
        sourceLogoJobId: z.string().min(1).optional(),
        creatorName: z.string().max(80).optional(),
        includeCreatorName: z.boolean().optional(),
      })
      .parse(req.body ?? {});
    try {
      const draft = await previewStreamsetDraft(req.user!.uid, body);
      sendSuccess(res, draft);
    } catch (err) {
      mapErr(err);
    }
  })
);

streamsetRoutes.post(
  '/quote',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        draftId: z.string().min(1).optional(),
        projectId: z.string().min(1).optional(),
        platform: z.enum(['twitch', 'tiktok', 'youtube', 'discord']).optional(),
        selectedKeys: z.array(z.string().min(1)).optional(),
        selectedSlotIds: z.array(z.string().min(1)).optional(),
        sourceLogoJobId: z.string().min(1).optional(),
        creatorName: z.string().max(80).optional(),
        includeCreatorName: z.boolean().optional(),
      })
      .parse(req.body ?? {});
    try {
      const draftId = body.draftId ?? (await previewStreamsetDraft(req.user!.uid, body)).id;
      const quote = await quoteStreamsetDraft(req.user!.uid, draftId);
      sendSuccess(res, { quote, generated: false, charged: false }, 201);
    } catch (err) {
      mapErr(err);
    }
  })
);

streamsetRoutes.post(
  '/quotes/:id/confirm',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    z.object({ confirm: z.literal(true) }).parse(req.body ?? {});
    try {
      const result = await confirmStreamsetQuote(req.user!.uid, String(req.params.id));
      sendSuccess(res, {
        quote: result.quote,
        batch: result.batch,
        jobs: result.jobs,
        coinsSpent: result.coinsSpent,
        refundedCoins: result.refundedCoins,
        newBalance: result.newBalance,
        batchStatus: result.batchStatus,
        generated: true,
        charged: true,
      });
    } catch (err) {
      mapErr(err);
    }
  })
);

streamsetRoutes.post(
  '/retry',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        batchId: z.string().min(1),
        assetKey: z.string().min(1),
        variant: z.boolean().optional(),
      })
      .parse(req.body ?? {});
    try {
      const inspected = await inspectStreamsetRetry(req.user!.uid, body.batchId, body.assetKey, body.variant);
      if (inspected.policy === 'in_flight') {
        sendSuccess(res, {
          started: false,
          inFlight: true,
          charged: false,
          policy: inspected.policy,
          job: inspected.job,
        });
        return;
      }
      if (inspected.policy === 'technical') {
        const result = await runTechnicalStreamsetRetry(req.user!.uid, body.batchId, body.assetKey);
        sendSuccess(res, {
          started: true,
          charged: false,
          policy: result.policy,
          job: result.job,
        });
        return;
      }
      if (inspected.policy === 'paid_quote') {
        const quote = await quoteStreamsetRetry(req.user!.uid, body.batchId, body.assetKey);
        sendSuccess(res, {
          started: false,
          charged: false,
          requiresQuote: true,
          policy: inspected.policy,
          quote,
          coinCost: inspected.coinCost,
          message: inspected.message,
        });
        return;
      }
      throw new ServiceError(409, 'RETRY_NOT_ALLOWED', inspected.message);
    } catch (err) {
      mapErr(err);
    }
  })
);

streamsetRoutes.post(
  '/pack',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = projectBody.parse(req.body ?? {});
    try {
      const result = await generateStreamsetPack(req.user!.uid, body.projectId);
      sendSuccess(res, result, 201);
    } catch (err) {
      mapErr(err);
    }
  })
);

streamsetRoutes.post(
  '/asset',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        assetKey: z.string().min(1).optional(),
        kind: z.enum(['overlay', 'banner', 'facecam', 'sticker']).optional(),
        projectId: z.string().min(1).optional(),
      })
      .refine((d) => Boolean(d.assetKey || d.kind), { message: 'assetKey oder kind erforderlich' })
      .parse(req.body);
    try {
      const result = await generateStreamsetAsset(req.user!.uid, body);
      sendSuccess(res, result, 201);
    } catch (err) {
      mapErr(err);
    }
  })
);
