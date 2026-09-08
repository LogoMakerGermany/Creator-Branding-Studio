import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Permission, ROLE_PERMISSIONS, UserRole } from '@ucbs/shared';
import { AppError } from '../middleware/errorHandler.js';
import { requireRole } from '../middleware/rbac.js';
import { arePaymentsEnabled } from '../config/env.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { getOrCreateUser, setUserDisabled, setUserRole } from './user.service.js';
import { addCoins, getCoinBalance, getTransactions } from './coins.service.js';
import { writeAdminAudit } from './admin-audit.service.js';
import {
  assertSafeAdminDisable,
  assertSafeAdminRoleChange,
  countActiveAdmins,
  getAdminSystemStatus,
  getAdminUserDetail,
  isLastActiveAdmin,
  listAdminJobs,
  listAdminUsersPage,
  sanitizeAdminJob,
  toAdminUserSummary,
} from './admin.service.js';
import { createInviteCode } from './invite.service.js';
import { dsSet } from '../lib/data-store.js';

process.env.NODE_TEST = '1';
process.env.DEV_AUTH_BYPASS = 'true';

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, '../..');
const repoRoot = join(dir, '../../..');

function src(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

describe('admin local closure', () => {
  const routes = src('src/routes/admin.routes.ts');
  const page = repo('frontend/src/pages/admin/AdminPage.tsx');
  const nav = repo('frontend/src/v2/layout/SidebarNav.tsx');
  const guard = repo('frontend/src/components/auth/ProtectedRoute.tsx');
  const api = repo('frontend/src/services/api.ts');

  it('admin APIs are server-gated; frontend route/nav are UX only', () => {
    assert.match(routes, /adminRoutes.use\(authenticate, requireRole\(UserRole\.ADMIN, UserRole\.SUPER_ADMIN\)\)/);
    const mw = requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN);
    assert.throws(
      () => mw({ user: undefined } as never, {} as never, () => undefined),
      (err: unknown) => err instanceof AppError && err.statusCode === 401
    );
    assert.throws(
      () =>
        mw(
          { user: { uid: 'u', email: 'a@x', role: UserRole.USER, displayName: 'u', coinBalance: 0 } } as never,
          {} as never,
          () => undefined
        ),
      (err: unknown) => err instanceof AppError && err.statusCode === 403
    );
    assert.equal(ROLE_PERMISSIONS[UserRole.USER].includes(Permission.VIEW_ADMIN), false);
    assert.match(guard, /export function AdminRoute/);
    assert.match(guard, /isAdminRole/);
    assert.match(nav, /showAdmin/);
    assert.match(nav, /to="\/admin"/);
    assert.match(page, /role="status"/);
    assert.equal(page.includes("from 'firebase/firestore'"), false);
    assert.equal(page.includes("from 'firebase/storage'"), false);
  });

  it('user list is paginated, searchable, and stripped of secrets', async () => {
    const a = await getOrCreateUser(`adm-u-${randomUUID()}`, 'a-admin@test.local', 'Alpha');
    const summary = toAdminUserSummary(a);
    assert.equal('password' in summary, false);
    assert.equal('nexterPreferences' in summary, false);
    assert.equal(JSON.stringify(summary).toLowerCase().includes('token'), false);
    const page1 = await listAdminUsersPage({ q: a.email, limit: 10, offset: 0 });
    assert.ok(page1.users.some((u) => u.id === a.id));
    assert.ok(page1.limit <= 50);
    const byUid = await listAdminUsersPage({ q: a.id.slice(0, 8), limit: 10, offset: 0 });
    assert.ok(byUid.total >= 1);
    const limited = await listAdminUsersPage({ limit: 1, offset: 0 });
    assert.equal(limited.users.length <= 1, true);
  });

  it('user detail exposes metadata only; jobs hide prompts and secrets', async () => {
    const user = await getOrCreateUser(`adm-d-${randomUUID()}`, 'd-admin@test.local', 'Delta');
    await dsSet('generationJobs', `job-${user.id}`, {
      id: `job-${user.id}`,
      userId: user.id,
      module: 'logo',
      status: 'failed',
      prompt: 'secret prompt',
      error: 'OPENAI_KEY leaked sk-test',
      createdAt: new Date().toISOString(),
    });
    const detail = await getAdminUserDetail(user.id);
    assert.equal(detail.user.email, user.email);
    assert.equal(detail.nexterSessionCount >= 0, true);
    const raw = JSON.stringify(detail);
    assert.equal(raw.includes('secret prompt'), false);
    assert.equal(/sk_live|FIREBASE_PRIVATE_KEY|BEGIN PRIVATE/.test(raw), false);
    assert.equal(detail.files.some((f) => 'downloadUrl' in f), false);
    const sanitized = sanitizeAdminJob({
      id: '1',
      userId: user.id,
      status: 'failed',
      prompt: 'nope',
      apiKey: 'secret',
      error: 'MODEL_TIMEOUT',
      createdAt: 't',
    });
    assert.equal(sanitized.errorCode, 'MODEL_TIMEOUT');
    assert.equal('prompt' in sanitized, false);
    const jobs = await listAdminJobs({ status: 'failed', limit: 50 });
    assert.ok(Array.isArray(jobs));
  });

  it('last admin cannot be demoted or disabled; self-disable blocked', async () => {
    const admin = await getOrCreateUser(`adm-last-${randomUUID()}`, 'last-admin@test.local', 'Last', {
      role: UserRole.ADMIN,
    });
    assert.equal(isLastActiveAdmin(0), true);
    assert.equal(isLastActiveAdmin(1), false);
    const remaining = await countActiveAdmins(admin.id);
    if (isLastActiveAdmin(remaining)) {
      await assert.rejects(
        () =>
          assertSafeAdminRoleChange({
            actorUserId: admin.id,
            actorRole: UserRole.ADMIN,
            target: admin,
            nextRole: UserRole.USER,
          }),
        (err: unknown) => err instanceof AppError && err.code === 'LAST_ADMIN'
      );
    }
    await assert.rejects(
      () => assertSafeAdminDisable({ actorUserId: admin.id, target: admin, disabled: true }),
      (err: unknown) => err instanceof AppError && err.code === 'SELF_LOCKOUT'
    );
    const other = await getOrCreateUser(`adm-o-${randomUUID()}`, 'other-admin@test.local', 'Other', {
      role: UserRole.ADMIN,
    });
    await assertSafeAdminRoleChange({
      actorUserId: admin.id,
      actorRole: UserRole.ADMIN,
      target: other,
      nextRole: UserRole.USER,
    });
    await setUserRole(other.id, UserRole.USER);
  });

  it('coin adjustments stay on the ledger with reason, actor, idempotency', async () => {
    const user = await getOrCreateUser(`adm-c-${randomUUID()}`, 'c-admin@test.local', 'Coins');
    const welcomeBefore = (await getTransactions(user.id, 20)).filter((t) =>
      String((t as { idempotencyKey?: string }).idempotencyKey ?? '').startsWith('welcome:')
    ).length;
    const before = await getCoinBalance(user.id);
    const key = `admin-coins:actor:${user.id}:${randomUUID()}`;
    const a = await addCoins(user.id, 7, 'Kulanz-Test', 'bonus', {
      adminActorId: 'actor',
      reason: 'Kulanz-Test',
      sourceType: 'admin',
      idempotencyKey: key,
    });
    const b = await addCoins(user.id, 7, 'Kulanz-Test', 'bonus', {
      adminActorId: 'actor',
      reason: 'Kulanz-Test',
      sourceType: 'admin',
      idempotencyKey: key,
    });
    assert.equal(a, before + 7);
    assert.equal(b, before + 7);
    await writeAdminAudit({
      actorUserId: 'actor',
      action: 'coin_adjustment',
      targetUserId: user.id,
      reason: 'Kulanz-Test',
      before: { coinBalance: before },
      after: { coinBalance: a, amount: 7 },
    });
    const welcomeAfter = (await getTransactions(user.id, 20)).filter((t) =>
      String((t as { idempotencyKey?: string }).idempotencyKey ?? '').startsWith('welcome:')
    ).length;
    assert.equal(welcomeAfter, welcomeBefore);
    assert.match(routes, /sourceType: 'admin'/);
    assert.match(routes, /idempotencyKey/);
    assert.match(routes, /INSUFFICIENT_COINS/);
  });

  it('invites, settings, jobs, payments and system status stay honest', async () => {
    const invite = await createInviteCode({ description: 'admin-closure', maximumUses: 1 }, 'admin-actor');
    assert.ok(invite.code);
    assert.match(routes, /invite_create/);
    assert.match(routes, /invite_deactivate/);
    assert.match(routes, /settings_update/);
    assert.equal(routes.includes('console.log(invite.code)'), false);
    const system = await getAdminSystemStatus();
    assert.equal(arePaymentsEnabled(), false);
    assert.equal(system.payments.enabled, false);
    assert.equal(system.devStore, true);
    assert.ok(system.environment === 'test' || system.environment === 'development');
    assert.equal('apiKey' in system.providers, false);
    for (const status of Object.values(system.providers)) {
      assert.equal('configured' in status, true);
    }
    assert.match(page, /Zahlungen/);
    assert.match(page, /deaktiviert/);
    assert.match(page, /kein Erlös|Kein Umsatz/);
    assert.match(page, /Invite erstellen/);
    assert.match(page, /Statusfilter/);
    assert.match(page, /kein Chat-Volltext/);
    assert.match(page, /Stale-Recovery/);
    assert.equal(page.includes('progressPercent'), false);
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.match(api, /limit/);
    assert.match(routes, /recoverStaleJobs/);
    assert.equal(routes.includes('generateSpeech'), false);
    await setUserDisabled(invite.createdBy, false).catch(() => undefined);
  });
});
