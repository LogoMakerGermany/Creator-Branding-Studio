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
import { getUserById, setUserRole } from '../services/user.service.js';
import { AppError } from '../middleware/errorHandler.js';

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
  asyncHandler(async (req, res) => {
    const schema = z.object({
      role: z.enum(['user', 'tester', 'admin', 'support']),
    });
    const body = schema.parse(req.body);
    const roleMap: Record<string, UserRole> = {
      user: UserRole.USER,
      tester: UserRole.TESTER,
      admin: UserRole.ADMIN,
      support: UserRole.SUPPORT,
    };
    const user = await setUserRole(paramId(req.params.userId), roleMap[body.role]!);
    sendSuccess(res, { user });
  })
);
