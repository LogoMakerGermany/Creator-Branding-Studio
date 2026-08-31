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
  FEEDBACK_CATEGORIES,
} from '../services/feedback.service.js';

export const feedbackRoutes = Router();
feedbackRoutes.use(authenticate, requirePermission(Permission.SUBMIT_FEEDBACK));

feedbackRoutes.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        module: z.string().min(1).max(80),
        route: z.string().max(200).optional(),
        message: z.string().min(3).max(2000),
        category: z.enum(FEEDBACK_CATEGORIES).optional(),
        screenshotDataUrl: z.string().max(2_000_000).optional(),
      })
      .parse(req.body);
    const row = await submitFeedback(req.user!.uid, body);
    sendSuccess(res, { feedback: row }, 201);
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
    sendSuccess(res, { feedback: row });
  })
);
