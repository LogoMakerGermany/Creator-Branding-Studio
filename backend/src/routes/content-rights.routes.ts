import { Router } from 'express';
import { z } from 'zod';
import {
  CONTENT_RIGHTS_REPORT_CATEGORIES,
  Permission,
  isAdminRole,
} from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess, AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  recordContentRightsAck,
  recordVoiceCloneConsent,
  submitContentRightsReport,
  listOwnContentRightsReports,
  getContentRightsReport,
  assertRightsReportReadable,
  toPublicRightsReport,
  CONTENT_RIGHTS_REPORT_MESSAGE_MAX,
  CONTENT_RIGHTS_CONTACT_MAX,
} from '../services/content-rights.service.js';
import { getUserById } from '../services/user.service.js';

export const contentRightsRoutes = Router();
contentRightsRoutes.use(authenticate, requirePermission(Permission.SUBMIT_FEEDBACK));

contentRightsRoutes.get(
  '/status',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = await getUserById(req.user!.uid);
    sendSuccess(res, {
      contentRightsAck: user?.contentRightsAck ?? null,
      voiceCloneConsent: user?.voiceCloneConsent
        ? { version: user.voiceCloneConsent.version, acceptedAt: user.voiceCloneConsent.acceptedAt, statement: user.voiceCloneConsent.statement }
        : null,
    });
  })
);

contentRightsRoutes.post(
  '/acknowledge',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        accepted: z.literal(true),
        targetUserId: z.string().optional(),
      })
      .parse(req.body ?? {});
    if (body.targetUserId && body.targetUserId !== req.user!.uid) {
      throw new AppError(403, 'FORBIDDEN', 'Rechtebestätigung nur für das eigene Konto');
    }
    const ack = await recordContentRightsAck(req.user!.uid);
    sendSuccess(res, { contentRightsAck: ack });
  })
);

contentRightsRoutes.post(
  '/voice-clone-consent',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        accepted: z.literal(true),
        statement: z.enum(['own', 'authorized']),
        targetUserId: z.string().optional(),
      })
      .parse(req.body ?? {});
    if (body.targetUserId && body.targetUserId !== req.user!.uid) {
      throw new AppError(403, 'FORBIDDEN', 'Einwilligung nur für das eigene Konto');
    }
    const consent = await recordVoiceCloneConsent(req.user!.uid, body.statement);
    sendSuccess(res, { voiceCloneConsent: consent });
  })
);

contentRightsRoutes.post(
  '/reports',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        category: z.enum(CONTENT_RIGHTS_REPORT_CATEGORIES),
        description: z.string().min(1).max(CONTENT_RIGHTS_REPORT_MESSAGE_MAX),
        reporterContact: z.string().max(CONTENT_RIGHTS_CONTACT_MAX).optional(),
        projectId: z.string().max(80).optional(),
        fileId: z.string().max(80).optional(),
        jobId: z.string().max(80).optional(),
      })
      .strict()
      .parse(req.body);
    const report = await submitContentRightsReport(req.user!.uid, body);
    sendSuccess(res, { report: toPublicRightsReport(report) }, 201);
  })
);

contentRightsRoutes.get(
  '/reports',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const reports = await listOwnContentRightsReports(req.user!.uid);
    sendSuccess(res, { reports });
  })
);

contentRightsRoutes.get(
  '/reports/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const row = await getContentRightsReport(String(req.params.id));
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Meldung nicht gefunden');
    const admin = isAdminRole(req.user!.role);
    await assertRightsReportReadable(row, req.user!.uid, admin);
    sendSuccess(res, { report: admin ? row : toPublicRightsReport(row) });
  })
);
