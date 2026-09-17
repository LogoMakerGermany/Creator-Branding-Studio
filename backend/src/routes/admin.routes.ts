import { Router } from 'express';
import { z } from 'zod';
import { Permission, UserRole, CONTENT_RIGHTS_REPORT_STATUSES } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, requireRole } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  createInviteCode,
  deactivateInviteCode,
  deleteInviteCode,
  getInviteById,
} from '../services/invite.service.js';
import { getSystemSettings, updateSystemSettings } from '../services/system-settings.service.js';
import { creditTestBalance } from '../services/ledger.service.js';
import { getUserById, setUserRole, setUserDisabled } from '../services/user.service.js';
import { addCoins, deductAmount } from '../services/coins.service.js';
import { getAdminAnalytics } from '../services/admin-analytics.service.js';
import { grantTesterCoins } from '../services/tester-grant.service.js';
import {
  listFeedbackPage,
  getFeedbackById,
  updateFeedbackStatus,
  parseFeedbackListParams,
  toSafeFeedback,
  issueFeedbackScreenshotUrl,
  FEEDBACK_STATUSES,
} from '../services/feedback.service.js';
import {
  listContentRightsReportsForAdmin,
  getContentRightsReport,
  updateContentRightsReportStatus,
  adminTakedownReportedFile,
  toAdminRightsReport,
} from '../services/content-rights.service.js';
import { AppError } from '../middleware/errorHandler.js';
import { writeAdminAudit, listAdminAudit } from '../services/admin-audit.service.js';
import { recoverStaleJobs } from '../services/job-recovery.service.js';
import { listPaymentClaims } from '../services/session-store.service.js';
import { deliverAssignedInviteEmail } from '../services/email.service.js';
import {
  assertSafeAdminDisable,
  assertSafeAdminRoleChange,
  getAdminDashboard,
  getAdminSystemStatus,
  getAdminUserDetail,
  listAdminInvites,
  listAdminJobs,
  listAdminUsersPage,
  parsePageParams,
} from '../services/admin.service.js';

export const adminRoutes = Router();

adminRoutes.use(authenticate, requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN));

adminRoutes.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { settings: await getSystemSettings() });
  })
);

adminRoutes.patch(
  '/settings',
  requirePermission(Permission.MANAGE_SYSTEM),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      registrationMode: z.enum(['closed', 'invite_only', 'public']).optional(),
      generationsEnabled: z.boolean().optional(),
      imageGenerationsEnabled: z.boolean().optional(),
      videoGenerationsEnabled: z.boolean().optional(),
      paymentsEnabled: z.boolean().optional(),
      activePricingVersion: z.string().min(1).optional(),
    });
    const body = schema.parse(req.body);
    const settings = await updateSystemSettings(body, req.user!.uid);
    await writeAdminAudit({
      actorUserId: req.user!.uid,
      action: 'settings_update',
      reason: 'system_settings',
      after: { ...body },
    });
    sendSuccess(res, { settings });
  })
);

adminRoutes.get(
  '/invites',
  requirePermission(Permission.MANAGE_INVITES),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { invites: await listAdminInvites() });
  })
);

adminRoutes.post(
  '/invites',
  requirePermission(Permission.MANAGE_INVITES),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      code: z.string().min(4).max(32).optional(),
      description: z.string().min(1).max(200),
      assignedEmail: z.string().email().optional(),
      maximumUses: z.number().int().min(1).max(1000).optional(),
      expiresAt: z.string().datetime().optional(),
      grantRole: z.enum(['user', 'tester']).optional(),
    });
    const body = schema.parse(req.body);
    const invite = await createInviteCode(body, req.user!.uid);
    await writeAdminAudit({
      actorUserId: req.user!.uid,
      action: 'invite_create',
      reason: invite.description,
      after: { inviteId: invite.id, grantRole: invite.grantRole, maximumUses: invite.maximumUses },
    });
    const email = await deliverAssignedInviteEmail(invite, { created: true });
    sendSuccess(res, { invite, email }, 201);
  })
);

adminRoutes.post(
  '/invites/:id/resend-email',
  requirePermission(Permission.MANAGE_INVITES),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const invite = await getInviteById(paramId(req.params.id));
    if (!invite) throw new AppError(404, 'INVALID_INPUT', 'Einladungscode nicht gefunden');
    if (!invite.assignedEmail) {
      throw new AppError(400, 'EMAIL_NOT_APPLICABLE', 'Diese Einladung hat keine zugewiesene E-Mail-Adresse.');
    }
    const email = await deliverAssignedInviteEmail(invite, { created: false });
    await writeAdminAudit({
      actorUserId: req.user!.uid,
      action: 'invite_email_retry',
      reason: 'resend',
      after: { inviteId: invite.id, sent: email.sent, duplicate: email.duplicate },
    });
    sendSuccess(res, { invite: { id: invite.id }, email });
  })
);

function paramId(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value[0]) return value[0];
  throw new AppError(400, 'INVALID_INPUT', 'Ungültige ID');
}

adminRoutes.post(
  '/invites/:id/deactivate',
  requirePermission(Permission.MANAGE_INVITES),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const invite = await deactivateInviteCode(paramId(req.params.id));
    await writeAdminAudit({
      actorUserId: req.user!.uid,
      action: 'invite_deactivate',
      reason: 'revoked',
      after: { inviteId: invite.id },
    });
    sendSuccess(res, { invite });
  })
);

adminRoutes.delete(
  '/invites/:id',
  requirePermission(Permission.MANAGE_INVITES),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = paramId(req.params.id);
    await deleteInviteCode(id);
    await writeAdminAudit({
      actorUserId: req.user!.uid,
      action: 'invite_delete',
      reason: 'deleted',
      after: { inviteId: id },
    });
    sendSuccess(res, { deleted: true });
  })
);

adminRoutes.post(
  '/users/:userId/test-credit',
  requirePermission(Permission.MANAGE_USERS),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      amountCents: z.number().int().positive(),
      description: z.string().min(1).max(200).default('Admin-Testguthaben'),
      expiresAt: z.string().datetime().optional(),
    });
    const body = schema.parse(req.body);
    const target = await getUserById(paramId(req.params.userId));
    if (!target) throw new AppError(404, 'INVALID_INPUT', 'Nutzer nicht gefunden');

    const result = await creditTestBalance(
      target.id,
      body.amountCents,
      req.user!.uid,
      body.description,
      body.expiresAt
    );
    sendSuccess(res, result, 201);
  })
);

adminRoutes.patch(
  '/users/:userId/role',
  requirePermission(Permission.MANAGE_USERS),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      role: z.enum(['user', 'tester', 'admin', 'support']),
      reason: z.string().min(3).max(200),
      confirm: z.literal(true),
    });
    const body = schema.parse(req.body);
    const roleMap: Record<string, UserRole> = {
      user: UserRole.USER,
      tester: UserRole.TESTER,
      admin: UserRole.ADMIN,
      support: UserRole.SUPPORT,
    };
    const target = await getUserById(paramId(req.params.userId));
    if (!target) throw new AppError(404, 'INVALID_INPUT', 'Nutzer nicht gefunden');
    if (target.role === UserRole.SUPER_ADMIN && req.user!.role !== UserRole.SUPER_ADMIN) {
      throw new AppError(403, 'FORBIDDEN', 'super_admin kann nicht geändert werden');
    }
    const nextRole = roleMap[body.role]!;
    await assertSafeAdminRoleChange({
      actorUserId: req.user!.uid,
      actorRole: req.user!.role as UserRole,
      target,
      nextRole,
    });
    const user = await setUserRole(target.id, nextRole);
    await writeAdminAudit({
      actorUserId: req.user!.uid,
      action: 'role_change',
      targetUserId: target.id,
      reason: body.reason,
      before: { role: target.role },
      after: { role: nextRole },
    });
    sendSuccess(res, { user });
  })
);

adminRoutes.get(
  '/analytics',
  requirePermission(Permission.VIEW_ADMIN),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { analytics: await getAdminAnalytics() });
  })
);

adminRoutes.get(
  '/overview',
  requirePermission(Permission.VIEW_ADMIN),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await getAdminDashboard());
  })
);

adminRoutes.get(
  '/system',
  requirePermission(Permission.VIEW_ADMIN),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { system: await getAdminSystemStatus() });
  })
);

adminRoutes.get(
  '/jobs',
  requirePermission(Permission.VIEW_ADMIN),
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const limitRaw = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;
    sendSuccess(res, { jobs: await listAdminJobs({ status, limit: limitRaw }) });
  })
);

adminRoutes.get(
  '/users',
  requirePermission(Permission.VIEW_USERS),
  asyncHandler(async (req, res) => {
    const page = parsePageParams(req.query);
    const result = await listAdminUsersPage(page);
    sendSuccess(res, result);
  })
);

adminRoutes.post(
  '/users/:userId/disable',
  requirePermission(Permission.MANAGE_USERS),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        disabled: z.boolean(),
        reason: z.string().min(3).max(200),
        confirm: z.literal(true),
      })
      .parse(req.body);
    const target = await getUserById(paramId(req.params.userId));
    if (!target) throw new AppError(404, 'INVALID_INPUT', 'Nutzer nicht gefunden');
    await assertSafeAdminDisable({
      actorUserId: req.user!.uid,
      target,
      disabled: body.disabled,
    });
    const user = await setUserDisabled(target.id, body.disabled);
    await writeAdminAudit({
      actorUserId: req.user!.uid,
      action: body.disabled ? 'user_disable' : 'user_enable',
      targetUserId: target.id,
      reason: body.reason,
      before: { disabled: target.disabled ?? false },
      after: { disabled: body.disabled },
    });
    sendSuccess(res, { user });
  })
);

adminRoutes.post(
  '/users/:userId/coins',
  requirePermission(Permission.MANAGE_USERS),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        amount: z.number().int(),
        reason: z.string().min(3).max(200),
        confirm: z.literal(true),
        idempotencyKey: z.string().min(8).max(80).optional(),
      })
      .parse(req.body);
    const target = await getUserById(paramId(req.params.userId));
    if (!target) throw new AppError(404, 'INVALID_INPUT', 'Nutzer nicht gefunden');
    if (body.amount === 0) throw new AppError(400, 'INVALID_INPUT', 'Betrag darf nicht 0 sein');

    const before = target.coinBalance;
    const key = body.idempotencyKey
      ? `admin-coins:${req.user!.uid}:${target.id}:${body.idempotencyKey}`
      : undefined;

    let coinBalance: number;
    if (body.amount > 0) {
      coinBalance = await addCoins(target.id, body.amount, body.reason, 'bonus', {
        adminActorId: req.user!.uid,
        reason: body.reason,
        sourceType: 'admin',
        sourceId: req.user!.uid,
        idempotencyKey: key,
      });
    } else {
      const result = await deductAmount(target.id, Math.abs(body.amount), body.reason, {
        adminActorId: req.user!.uid,
        reason: body.reason,
        sourceType: 'admin',
        sourceId: req.user!.uid,
        idempotencyKey: key,
      });
      if (!result.success) throw new AppError(400, 'INSUFFICIENT_COINS', 'Guthaben reicht nicht');
      coinBalance = result.newBalance;
    }

    await writeAdminAudit({
      actorUserId: req.user!.uid,
      action: 'coin_adjustment',
      targetUserId: target.id,
      reason: body.reason,
      before: { coinBalance: before },
      after: { coinBalance, amount: body.amount },
    });
    sendSuccess(res, { coinBalance });
  })
);

adminRoutes.post(
  '/users/:userId/tester-grant',
  requirePermission(Permission.MANAGE_USERS),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        reason: z.string().min(3).max(200),
        confirm: z.literal(true),
      })
      .parse(req.body);
    const result = await grantTesterCoins({
      actorUserId: req.user!.uid,
      targetUserId: paramId(req.params.userId),
      reason: body.reason,
      confirm: true,
    });
    sendSuccess(res, result, result.duplicate ? 200 : 201);
  })
);

adminRoutes.get(
  '/feedback',
  requirePermission(Permission.VIEW_ADMIN),
  asyncHandler(async (req, res) => {
    const { limit, offset } = parseFeedbackListParams(req.query);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const page = await listFeedbackPage({ status, type, category, limit, offset });
    sendSuccess(res, {
      feedback: page.items,
      total: page.total,
      limit: page.limit,
      offset: page.offset,
      hasMore: page.hasMore,
    });
  })
);

adminRoutes.get(
  '/feedback/:id/screenshot',
  requirePermission(Permission.VIEW_ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const issued = await issueFeedbackScreenshotUrl(paramId(req.params.id), req.user!.uid, true);
    sendSuccess(res, issued);
  })
);

adminRoutes.get(
  '/feedback/:id',
  requirePermission(Permission.VIEW_ADMIN),
  asyncHandler(async (req, res) => {
    const row = await getFeedbackById(paramId(req.params.id));
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Feedback nicht gefunden');
    sendSuccess(res, { feedback: toSafeFeedback(row) });
  })
);

adminRoutes.patch(
  '/feedback/:id',
  requirePermission(Permission.VIEW_ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z.object({ status: z.enum(FEEDBACK_STATUSES) }).parse(req.body);
    const id = paramId(req.params.id);
    const before = await getFeedbackById(id);
    const row = await updateFeedbackStatus(id, body.status);
    await writeAdminAudit({
      actorUserId: req.user!.uid,
      action: 'feedback_status',
      targetUserId: row.userId,
      reason: `status:${body.status}`,
      before: { id, status: before?.status ?? null },
      after: { id, status: row.status },
    });
    sendSuccess(res, { feedback: toSafeFeedback(row) });
  })
);

adminRoutes.get(
  '/users/:userId',
  requirePermission(Permission.VIEW_USERS),
  asyncHandler(async (req, res) => {
    const detail = await getAdminUserDetail(paramId(req.params.userId));
    sendSuccess(res, detail);
  })
);

adminRoutes.get(
  '/audit',
  requirePermission(Permission.VIEW_ADMIN),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { audit: await listAdminAudit(100) });
  })
);

adminRoutes.get(
  '/payments',
  requirePermission(Permission.VIEW_ADMIN),
  asyncHandler(async (_req, res) => {
    const [stripe, paypal] = await Promise.all([
      listPaymentClaims('stripe', 50),
      listPaymentClaims('paypal', 50),
    ]);
    sendSuccess(res, { stripe, paypal });
  })
);

adminRoutes.post(
  '/jobs/recover',
  requirePermission(Permission.MANAGE_SYSTEM),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await recoverStaleJobs();
    await writeAdminAudit({
      actorUserId: req.user!.uid,
      action: 'jobs_recover',
      reason: 'stale-job-recovery',
      after: { ...result },
    });
    sendSuccess(res, { recovery: result });
  })
);

adminRoutes.get(
  '/content-rights-reports',
  requirePermission(Permission.VIEW_ADMIN),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { reports: await listContentRightsReportsForAdmin(100) });
  })
);

adminRoutes.get(
  '/content-rights-reports/:id',
  requirePermission(Permission.VIEW_ADMIN),
  asyncHandler(async (req, res) => {
    const row = await getContentRightsReport(paramId(req.params.id));
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Meldung nicht gefunden');
    sendSuccess(res, { report: toAdminRightsReport(row) });
  })
);

adminRoutes.patch(
  '/content-rights-reports/:id',
  requirePermission(Permission.VIEW_ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        status: z.enum(CONTENT_RIGHTS_REPORT_STATUSES),
        adminNotes: z.string().max(2000).optional(),
      })
      .parse(req.body);
    const id = paramId(req.params.id);
    const before = await getContentRightsReport(id);
    const row = await updateContentRightsReportStatus(id, body.status, body.adminNotes);
    await writeAdminAudit({
      actorUserId: req.user!.uid,
      action: 'content_rights_status',
      targetUserId: row.reporterUserId,
      reason: `status:${body.status}`,
      before: { id, status: before?.status ?? null },
      after: { id, status: row.status },
    });
    sendSuccess(res, { report: toAdminRightsReport(row) });
  })
);

adminRoutes.post(
  '/content-rights-reports/:id/takedown',
  requirePermission(Permission.VIEW_ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = paramId(req.params.id);
    const row = await adminTakedownReportedFile(req.user!.uid, id);
    await writeAdminAudit({
      actorUserId: req.user!.uid,
      action: 'content_rights_takedown',
      targetUserId: row.reporterUserId,
      reason: `file:${row.takedownFileId ?? ''}`,
      after: { id: row.id, status: row.status, takedownFileId: row.takedownFileId ?? null },
    });
    sendSuccess(res, { report: toAdminRightsReport(row) });
  })
);
