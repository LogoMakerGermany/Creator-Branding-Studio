import { UserRole, isAdminRole } from '@ucbs/shared';
import { AppError } from '../middleware/errorHandler.js';
import {
  isDevMode,
  isProduction,
  isFirebaseAdminConfigured,
  arePaymentsEnabled,
  getAiProviderStatus,
  getPaidGenerationAvailability,
  getFirebaseProjectConsistency,
  getFirebaseAuthEmailStatus,
  getCustomEmailProviderStatus,
  getTransactionalEmailStatus,
  getFirebaseStorageBucket,
} from '../config/env.js';
import { listUsers, type UserProfile } from './user.service.js';
import { getTransactions } from './coins.service.js';
import { listProjects } from './project.service.js';
import { listUserFiles } from './file-cloud.service.js';
import { listAdminAuditForTarget } from './admin-audit.service.js';
import { dsList, dsListWhere } from '../lib/data-store.js';
import { getSystemSettings } from './system-settings.service.js';
import { listInviteCodes } from './invite.service.js';
import { inviteEmailDeliveryFromStore } from './email.service.js';
import { getAdminAnalytics } from './admin-analytics.service.js';

export const ADMIN_USER_PAGE_DEFAULT = 25;
export const ADMIN_USER_PAGE_MAX = 50;
export const ADMIN_JOB_LIST_MAX = 50;
export const ADMIN_INVITE_LIST_MAX = 100;

export interface AdminUserSummary {
  id: string;
  displayName: string;
  email: string;
  role: string;
  disabled: boolean;
  coinBalance: number;
  createdAt: string;
  authProviders: string[];
  onboardingCompleted: boolean;
  emailVerified: boolean | null;
}

export interface AdminJobSummary {
  id: string;
  userId: string;
  module?: string;
  type?: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  errorCode?: string;
  assetKey?: string;
  parentJobId?: string;
  batchId?: string;
  refunded?: boolean;
}

const SECRET_KEY = /token|secret|password|authorization|apikey|privatekey|serviceaccount/i;

export function toAdminUserSummary(user: UserProfile, emailVerified: boolean | null = null): AdminUserSummary {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    disabled: Boolean(user.disabled),
    coinBalance: user.coinBalance,
    createdAt: user.createdAt,
    authProviders: user.authProviders ?? [],
    onboardingCompleted: user.onboardingCompleted,
    emailVerified,
  };
}

export function sanitizeAdminJob(raw: Record<string, unknown>): AdminJobSummary {
  const error = raw.error ?? raw.errorCode ?? raw.failureCode;
  let errorCode: string | undefined;
  if (typeof error === 'string') {
    errorCode = error.slice(0, 180);
    if (SECRET_KEY.test(errorCode) || /https?:\/\//i.test(errorCode)) errorCode = 'REDACTED';
  }
  const summary: AdminJobSummary = {
    id: String(raw.id ?? ''),
    userId: String(raw.userId ?? ''),
    module: raw.module != null ? String(raw.module) : undefined,
    type: raw.type != null ? String(raw.type) : undefined,
    status: String(raw.status ?? 'unknown'),
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: raw.updatedAt != null ? String(raw.updatedAt) : undefined,
    errorCode,
  };
  if (typeof raw.assetKey === 'string') summary.assetKey = raw.assetKey.slice(0, 80);
  if (typeof raw.parentJobId === 'string') summary.parentJobId = raw.parentJobId.slice(0, 80);
  if (typeof raw.batchId === 'string') summary.batchId = raw.batchId.slice(0, 80);
  if (typeof raw.refunded === 'boolean') summary.refunded = raw.refunded;
  return summary;
}

export function sanitizeAdminTransaction(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: raw.id,
    type: raw.type,
    amount: raw.amount,
    description: raw.description,
    createdAt: raw.createdAt,
    sourceType: raw.sourceType,
  };
  if (raw.adminActorId) out.adminActorId = raw.adminActorId;
  return out;
}

export function stripSecretsFromUnknown(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecretsFromUnknown);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(k)) continue;
      out[k] = stripSecretsFromUnknown(v);
    }
    return out;
  }
  return value;
}

export function parsePageParams(query: { limit?: unknown; offset?: unknown; q?: unknown }): {
  limit: number;
  offset: number;
  q: string;
} {
  const limitRaw = typeof query.limit === 'string' ? Number.parseInt(query.limit, 10) : Number(query.limit);
  const offsetRaw = typeof query.offset === 'string' ? Number.parseInt(query.offset, 10) : Number(query.offset);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(ADMIN_USER_PAGE_MAX, Math.max(1, Math.floor(limitRaw)))
    : ADMIN_USER_PAGE_DEFAULT;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;
  const q = typeof query.q === 'string' ? query.q.trim() : '';
  return { limit, offset, q };
}

export async function listAdminUsersPage(opts: { q?: string; limit?: number; offset?: number }): Promise<{
  users: AdminUserSummary[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}> {
  const limit = Math.min(ADMIN_USER_PAGE_MAX, Math.max(1, opts.limit ?? ADMIN_USER_PAGE_DEFAULT));
  const offset = Math.max(0, opts.offset ?? 0);
  const q = (opts.q ?? '').trim().toLowerCase();
  const all = await listUsers();
  const filtered = q
    ? all.filter(
        (u) =>
          u.email.toLowerCase().includes(q) ||
          u.displayName.toLowerCase().includes(q) ||
          u.id.toLowerCase().includes(q)
      )
    : all;
  const slice = filtered.slice(offset, offset + limit);
  return {
    users: slice.map((u) => toAdminUserSummary(u)),
    total: filtered.length,
    limit,
    offset,
    hasMore: offset + slice.length < filtered.length,
  };
}

export function isLastActiveAdmin(remainingExcludingTarget: number): boolean {
  return remainingExcludingTarget < 1;
}

export async function countActiveAdmins(exceptUserId?: string): Promise<number> {
  const users = await listUsers();
  return users.filter(
    (u) => isAdminRole(u.role) && !u.disabled && (!exceptUserId || u.id !== exceptUserId)
  ).length;
}

export async function assertSafeAdminRoleChange(params: {
  actorUserId: string;
  actorRole: UserRole;
  target: UserProfile;
  nextRole: UserRole;
}): Promise<void> {
  if (params.target.role === UserRole.SUPER_ADMIN && params.actorRole !== UserRole.SUPER_ADMIN) {
    throw new AppError(403, 'FORBIDDEN', 'super_admin kann nicht geändert werden');
  }
  const wasAdmin = isAdminRole(params.target.role);
  const staysAdmin = isAdminRole(params.nextRole);
  if (wasAdmin && !staysAdmin) {
    const remaining = await countActiveAdmins(params.target.id);
    if (isLastActiveAdmin(remaining)) {
      throw new AppError(400, 'LAST_ADMIN', 'Der letzte Admin kann nicht herabgestuft werden');
    }
  }
}

export async function assertSafeAdminDisable(params: {
  actorUserId: string;
  target: UserProfile;
  disabled: boolean;
}): Promise<void> {
  if (params.disabled && params.target.id === params.actorUserId) {
    throw new AppError(400, 'SELF_LOCKOUT', 'Eigenes Konto kann nicht gesperrt werden');
  }
  if (params.disabled && isAdminRole(params.target.role)) {
    const remaining = await countActiveAdmins(params.target.id);
    if (isLastActiveAdmin(remaining)) {
      throw new AppError(400, 'LAST_ADMIN', 'Der letzte Admin kann nicht gesperrt werden');
    }
  }
}

export async function getAdminUserDetail(userId: string): Promise<{
  user: AdminUserSummary;
  transactions: Record<string, unknown>[];
  jobs: AdminJobSummary[];
  audit: unknown[];
  projects: Array<{ id: string; name: string; type?: string; createdAt?: string; updatedAt?: string }>;
  files: Array<{ id: string; name: string; mimeType?: string; size?: number; category?: string; createdAt?: string }>;
  nexterSessionCount: number;
}> {
  const { getUserById } = await import('./user.service.js');
  const user = await getUserById(userId);
  if (!user) throw new AppError(404, 'INVALID_INPUT', 'Nutzer nicht gefunden');

  const [transactions, jobs, audit, projects, files, sessions] = await Promise.all([
    getTransactions(user.id, 30),
    dsListWhere('generationJobs', { userId: user.id }),
    listAdminAuditForTarget(user.id, 30),
    listProjects(user.id),
    listUserFiles(user.id),
    dsListWhere('nexterSessions', { userId: user.id }),
  ]);

  return {
    user: toAdminUserSummary(user),
    transactions: (transactions as unknown as Record<string, unknown>[]).map(sanitizeAdminTransaction),
    jobs: jobs.slice(0, 30).map(sanitizeAdminJob),
    audit: stripSecretsFromUnknown(audit) as unknown[],
    projects: projects.slice(0, 30).map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
    files: files.slice(0, 30).map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size,
      category: f.category,
      createdAt: f.createdAt,
    })),
    nexterSessionCount: sessions.length,
  };
}

export async function listAdminJobs(opts?: { status?: string; limit?: number }): Promise<AdminJobSummary[]> {
  const parsed = opts?.limit;
  const limit = Number.isFinite(parsed)
    ? Math.min(ADMIN_JOB_LIST_MAX, Math.max(1, parsed as number))
    : ADMIN_JOB_LIST_MAX;
  const rows = await dsList('generationJobs', { orderBy: 'createdAt', order: 'desc', limit: 100 });
  const status = opts?.status?.trim().toLowerCase();
  const filtered = status ? rows.filter((j) => String(j.status ?? '').toLowerCase() === status) : rows;
  return filtered.slice(0, limit).map(sanitizeAdminJob);
}

export async function listAdminInvites() {
  const rows = await listInviteCodes();
  const sliced = rows.slice(0, ADMIN_INVITE_LIST_MAX);
  return Promise.all(
    sliced.map(async (invite) => {
      const email = await inviteEmailDeliveryFromStore(invite);
      return {
        id: invite.id,
        code: invite.code,
        description: invite.description,
        assignedEmail: invite.assignedEmail,
        maximumUses: invite.maximumUses,
        currentUses: invite.currentUses,
        expiresAt: invite.expiresAt,
        isActive: invite.isActive,
        grantRole: invite.grantRole,
        createdAt: invite.createdAt,
        email,
      };
    })
  );
}

export function adminEnvironmentLabel(): 'production' | 'test' | 'development' {
  if (isProduction()) return 'production';
  if (process.env.NODE_TEST) return 'test';
  return 'development';
}

export async function getAdminSystemStatus() {
  const settings = await getSystemSettings();
  const firebaseAdmin = isFirebaseAdminConfigured();
  return {
    environment: adminEnvironmentLabel(),
    firebase: {
      adminConfigured: firebaseAdmin,
      mode: isProduction() ? 'production' : firebaseAdmin ? 'admin' : 'dev-store',
      projectConsistency: getFirebaseProjectConsistency(),
    },
    firestore: {
      configured: firebaseAdmin && !isDevMode(),
      liveChecked: false,
      available: null as boolean | null,
      mode: isDevMode() ? 'dev-store' : firebaseAdmin ? 'firestore' : 'unavailable',
    },
    storage: {
      configured: Boolean(getFirebaseStorageBucket()) || (firebaseAdmin && !isDevMode()),
      liveChecked: false,
      available: null as boolean | null,
    },
    email: {
      firebaseAuthEmail: getFirebaseAuthEmailStatus(),
      customProvider: 'resend',
      customProviderStatus: getCustomEmailProviderStatus(),
      transactional: getTransactionalEmailStatus(),
    },
    devStore: isDevMode(),
    checkedAt: new Date().toISOString(),
    processUptimeSec: Math.floor(process.uptime()),
    payments: {
      envEnabled: arePaymentsEnabled(),
      settingsEnabled: settings.paymentsEnabled,
      enabled: arePaymentsEnabled() && settings.paymentsEnabled,
    },
    settings: {
      registrationMode: settings.registrationMode,
      generationsEnabled: settings.generationsEnabled,
      imageGenerationsEnabled: settings.imageGenerationsEnabled,
      videoGenerationsEnabled: settings.videoGenerationsEnabled,
      paymentsEnabled: settings.paymentsEnabled,
      activePricingVersion: settings.activePricingVersion,
      updatedAt: settings.updatedAt,
    },
    providers: getAiProviderStatus(),
    generationAvailability: getPaidGenerationAvailability(),
  };
}

export async function getAdminDashboard() {
  const [analytics, system, invites] = await Promise.all([
    getAdminAnalytics(),
    getAdminSystemStatus(),
    listInviteCodes().catch(() => []),
  ]);
  return {
    analytics: {
      ...analytics,
      inviteCount: invites.length,
      activeInviteCount: invites.filter((i) => i.isActive).length,
    },
    system,
  };
}
