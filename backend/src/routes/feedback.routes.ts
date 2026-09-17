import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { Permission, UserRole, isAdminRole } from '@ucbs/shared';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { z } from 'zod';
import {
  submitFeedback,
  getFeedbackById,
  assertFeedbackReadable,
  listOwnFeedback,
  parseFeedbackListParams,
  toSafeFeedback,
  issueFeedbackScreenshotUrl,
  FEEDBACK_CATEGORIES,
  FEEDBACK_TYPES,
} from '../services/feedback.service.js';

export const feedbackRoutes = Router();
feedbackRoutes.use(authenticate, requirePermission(Permission.SUBMIT_FEEDBACK));

feedbackRoutes.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        module: z.string().min(1).max(80).optional(),
        route: z.string().max(200).optional(),
        message: z.string().min(1).max(8000),
        subject: z.string().max(200).optional(),
        type: z.enum(FEEDBACK_TYPES).optional(),
        category: z.enum(FEEDBACK_CATEGORIES).optional(),
        projectId: z.string().max(80).optional(),
        jobId: z.string().max(80).optional(),
        fileId: z.string().max(80).optional(),
        requestId: z.string().max(80).optional(),
        idempotencyKey: z.string().max(80).optional(),
        screenshotDataUrl: z.string().max(2_000_000).optional(),
      })
      .parse(req.body);
    const row = await submitFeedback(req.user!.uid, body);
    sendSuccess(res, { feedback: toSafeFeedback(row) }, 201);
  })
);

feedbackRoutes.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { limit, offset } = parseFeedbackListParams(req.query);
    const page = await listOwnFeedback(req.user!.uid, { limit, offset });
    sendSuccess(res, {
      feedback: page.items,
      total: page.total,
      limit: page.limit,
      offset: page.offset,
      hasMore: page.hasMore,
    });
  })
);

feedbackRoutes.get(
  '/:id/screenshot',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const issued = await issueFeedbackScreenshotUrl(
      String(req.params.id),
      req.user!.uid,
      isAdminRole(req.user!.role as UserRole)
    );
    sendSuccess(res, issued);
  })
);

feedbackRoutes.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const row = await getFeedbackById(String(req.params.id));
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Feedback nicht gefunden');
    try {
      assertFeedbackReadable(row, req.user!.uid, isAdminRole(req.user!.role as UserRole));
    } catch {
      throw new AppError(404, 'NOT_FOUND', 'Feedback nicht gefunden');
    }
    sendSuccess(res, { feedback: toSafeFeedback(row) });
  })
);
