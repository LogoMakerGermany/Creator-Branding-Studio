import { Router } from 'express';
import { z } from 'zod';
import { Permission, UserRole } from '@ucbs/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, requireRole } from '../middleware/rbac.js';
import { asyncHandler, sendSuccess } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  createInviteCode,
  deactivateInviteCode,
  deleteInviteCode,
  listInviteCodes,
} from '../services/invite.service.js';
import { getSystemSettings, updateSystemSettings } from '../services/system-settings.service.js';
import { creditTestBalance } from '../services/ledger.service.js';
import { getUserById, setUserRole, listUsers, searchUsers, setUserDisabled } from '../services/user.service.js';
import { addCoins, deductAmount, getTransactions } from '../services/coins.service.js';
import { getAdminAnalytics } from '../services/admin-analytics.service.js';
import { grantTesterCoins } from '../services/tester-grant.service.js';
import { listFeedback, updateFeedbackStatus, FEEDBACK_STATUSES } from '../services/feedback.service.js';
import { AppError } from '../middleware/errorHandler.js';
import { writeAdminAudit, listAdminAudit, listAdminAuditForTarget } from '../services/admin-audit.service.js';
import { recoverStaleJobs } from '../services/job-recovery.service.js';
import { listPaymentClaims } from '../services/session-store.service.js';
import { dsListWhere } from '../lib/data-store.js';
import { dispatchTransactionalEmail, inviteEmail } from '../services/email.service.js';

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
    sendSuccess(res, { settings });
  })
);

adminRoutes.get(
  '/invites',
  requirePermission(Permission.MANAGE_INVITES),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { invites: await listInviteCodes() });
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
    if (invite.assignedEmail) {
      void dispatchTransactionalEmail(
        `invite:${invite.id}`,
        inviteEmail(invite.assignedEmail, invite.code, invite.description)
      ).catch(() => undefined);
    }
    sendSuccess(res, { invite }, 201);
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
  asyncHandler(async (req, res) => {
    const invite = await deactivateInviteCode(paramId(req.params.id));
    sendSuccess(res, { invite });
  })
);

adminRoutes.delete(
  '/invites/:id',
  requirePermission(Permission.MANAGE_INVITES),
  asyncHandler(async (req, res) => {
    await deleteInviteCode(paramId(req.params.id));
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
  '/users',
  requirePermission(Permission.VIEW_USERS),
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const users = q ? await searchUsers(q) : await listUsers();
    sendSuccess(res, { users });
  })
);

adminRoutes.post(
  '/users/:userId/disable',
  requirePermission(Permission.MANAGE_USERS),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({
        disabled: z.boolean(),
        reason: z.string().min(3).max(200).optional(),
      })
      .parse(req.body);
    const target = await getUserById(paramId(req.params.userId));
    if (!target) throw new AppError(404, 'INVALID_INPUT', 'Nutzer nicht gefunden');
    const user = await setUserDisabled(target.id, body.disabled);
    await writeAdminAudit({
      actorUserId: req.user!.uid,
      action: body.disabled ? 'user_disable' : 'user_enable',
      targetUserId: target.id,
      reason: body.reason ?? (body.disabled ? 'disabled' : 'enabled'),
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
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { feedback: await listFeedback() });
  })
);

adminRoutes.patch(
  '/feedback/:id',
  requirePermission(Permission.VIEW_ADMIN),
  asyncHandler(async (req, res) => {
    const body = z.object({ status: z.enum(FEEDBACK_STATUSES) }).parse(req.body);
    const row = await updateFeedbackStatus(paramId(req.params.id), body.status);
    sendSuccess(res, { feedback: row });
  })
);

adminRoutes.get(
  '/users/:userId',
  requirePermission(Permission.VIEW_USERS),
  asyncHandler(async (req, res) => {
    const user = await getUserById(paramId(req.params.userId));
    if (!user) throw new AppError(404, 'INVALID_INPUT', 'Nutzer nicht gefunden');
    const [transactions, jobs, audit] = await Promise.all([
      getTransactions(user.id, 30),
      dsListWhere('generationJobs', { userId: user.id }),
      listAdminAuditForTarget(user.id, 30),
    ]);
    sendSuccess(res, {
      user,
      transactions,
      jobs: jobs.slice(0, 30),
      audit,
    });
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
  asyncHandler(async (_req, res) => {
    const result = await recoverStaleJobs();
    sendSuccess(res, { recovery: result });
  })
);
