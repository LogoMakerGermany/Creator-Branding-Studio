import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UserRole, type RegistrationMode, currentDraftLegalAcceptanceInput } from '@ucbs/shared';
import { AppError } from '../middleware/errorHandler.js';
import { ServiceError } from '../lib/errors.js';
import { getRegistrationModeEnv, normalizeRegistrationMode } from '../config/env.js';
import { getOrCreateUser, getUserById } from './user.service.js';
import { getCoinBalance, getTransactions } from './coins.service.js';
import { createInviteCode, getInviteByCode, redeemInviteCode, validateInviteCode } from './invite.service.js';
import { getRegistrationMode, getSystemSettings, updateSystemSettings } from './system-settings.service.js';
import { syncAuthenticatedAppUser } from './auth-registration.service.js';
import { dsSet } from '../lib/data-store.js';

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

function isInviteBlocked(err: unknown): boolean {
  if (!(err instanceof AppError || err instanceof ServiceError) || err.statusCode !== 403) return false;
  return [
    'ACCESS_DENIED',
    'INVITE_REQUIRED',
    'INVITE_INVALID',
    'INVITE_EXPIRED',
    'INVITE_EXHAUSTED',
    'INVITE_EMAIL_REQUIRED',
    'INVITE_EMAIL_MISMATCH',
  ].includes(err.code);
}

async function withRegistrationMode<T>(mode: RegistrationMode, fn: () => Promise<T>): Promise<T> {
  const prev = (await getSystemSettings()).registrationMode;
  await updateSystemSettings({ registrationMode: mode }, 'invite-gate-test');
  try {
    return await fn();
  } finally {
    await updateSystemSettings({ registrationMode: prev }, 'invite-gate-test');
  }
}

describe('P1 invite-only vs public registration', () => {
  it('REGISTRATION_MODE missing or invalid is invite_only; only public opens signup', () => {
    assert.equal(normalizeRegistrationMode(undefined), 'invite_only');
    assert.equal(normalizeRegistrationMode(''), 'invite_only');
    assert.equal(normalizeRegistrationMode('open'), 'invite_only');
    assert.equal(normalizeRegistrationMode('true'), 'invite_only');
    assert.equal(normalizeRegistrationMode('invite_only'), 'invite_only');
    assert.equal(normalizeRegistrationMode('PUBLIC'), 'public');
    assert.equal(normalizeRegistrationMode('closed'), 'closed');
    const prev = process.env.REGISTRATION_MODE;
    try {
      delete process.env.REGISTRATION_MODE;
      assert.equal(getRegistrationModeEnv(), 'invite_only');
      process.env.REGISTRATION_MODE = '  ';
      assert.equal(getRegistrationModeEnv(), 'invite_only');
      process.env.REGISTRATION_MODE = 'nope';
      assert.equal(getRegistrationModeEnv(), 'invite_only');
      process.env.REGISTRATION_MODE = 'public';
      assert.equal(getRegistrationModeEnv(), 'public');
    } finally {
      if (prev === undefined) delete process.env.REGISTRATION_MODE;
      else process.env.REGISTRATION_MODE = prev;
    }
  });

  it('stored invalid registrationMode is treated as invite_only', async () => {
    const prev = await getSystemSettings();
    await dsSet('system_settings', 'platform', {
      ...prev,
      registrationMode: 'open-beta',
    } as unknown as Record<string, unknown>);
    try {
      assert.equal(await getRegistrationMode(), 'invite_only');
    } finally {
      await dsSet('system_settings', 'platform', prev as unknown as Record<string, unknown>);
    }
  });

  it('existing app user can login in invite_only without a new invite', async () => {
    await withRegistrationMode('invite_only', async () => {
      const existing = await getOrCreateUser(`reg-ex-${randomUUID()}`, 'exist@reg.test', 'Existing');
      const before = await getCoinBalance(existing.id);
      const result = await syncAuthenticatedAppUser({
        uid: existing.id,
        email: existing.email,
        authProvider: 'google',
      });
      assert.equal(result.created, false);
      assert.equal(result.user.id, existing.id);
      assert.equal(await getCoinBalance(existing.id), before);
    });
  });

  it('new email user without invite is blocked and gets no welcome coins', async () => {
    await withRegistrationMode('invite_only', async () => {
      const uid = `reg-new-${randomUUID()}`;
      await assert.rejects(
        () =>
          syncAuthenticatedAppUser({
            uid,
            email: `${uid}@reg.test`,
            displayName: 'Blocked',
            authProvider: 'email',
          }),
        isInviteBlocked
      );
      assert.equal(await getUserById(uid), null);
      assert.equal(await getCoinBalance(uid), 0);
      assert.equal((await getTransactions(uid)).length, 0);
    });
  });

  it('new Google user without invite is blocked', async () => {
    await withRegistrationMode('invite_only', async () => {
      const uid = `reg-g-${randomUUID()}`;
      await assert.rejects(
        () =>
          syncAuthenticatedAppUser({
            uid,
            email: `${uid}@gmail.test`,
            authProvider: 'google',
          }),
        isInviteBlocked
      );
      assert.equal(await getUserById(uid), null);
    });
  });

  it('existing Google app user can sync without invite', async () => {
    await withRegistrationMode('invite_only', async () => {
      const existing = await getOrCreateUser(`reg-gex-${randomUUID()}`, 'gexist@reg.test', 'GExist', {
        authProvider: 'google',
      });
      const result = await syncAuthenticatedAppUser({
        uid: existing.id,
        email: existing.email,
        authProvider: 'google',
      });
      assert.equal(result.created, false);
      assert.ok(result.user.authProviders.includes('google'));
    });
  });

  it('new Firebase user without app record is blocked', async () => {
    await withRegistrationMode('invite_only', async () => {
      const uid = `reg-fb-${randomUUID()}`;
      await assert.rejects(
        () => syncAuthenticatedAppUser({ uid, email: `${uid}@firebase.test` }),
        isInviteBlocked
      );
      assert.equal(await getUserById(uid), null);
    });
  });

  it('valid invite creates an app user once', async () => {
    await withRegistrationMode('invite_only', async () => {
      const invite = await createInviteCode(
        { description: 'beta', grantRole: 'tester', maximumUses: 1 },
        'admin-reg'
      );
      const uid = `reg-ok-${randomUUID()}`;
      const result = await syncAuthenticatedAppUser({
        uid,
        email: `${uid}@ok.test`,
        displayName: 'Invited',
        inviteCode: invite.code,
        authProvider: 'email',
        legalAcceptance: currentDraftLegalAcceptanceInput(),
      });
      assert.equal(result.created, true);
      assert.equal(result.user.role, UserRole.TESTER);
      assert.ok((await getCoinBalance(uid)) > 0);
      const reused = await getInviteByCode(invite.code);
      assert.equal(reused?.currentUses, 1);
    });
  });

  it('invalid invite is blocked without creating a user', async () => {
    await withRegistrationMode('invite_only', async () => {
      const uid = `reg-bad-${randomUUID()}`;
      await assert.rejects(
        () =>
          syncAuthenticatedAppUser({
            uid,
            email: `${uid}@bad.test`,
            inviteCode: 'NOT-A-REAL-CODE',
            authProvider: 'email',
            legalAcceptance: currentDraftLegalAcceptanceInput(),
          }),
        isInviteBlocked
      );
      assert.equal(await getUserById(uid), null);
      assert.equal(await getCoinBalance(uid), 0);
    });
  });

  it('consumed single-use invite cannot be reused', async () => {
    await withRegistrationMode('invite_only', async () => {
      const invite = await createInviteCode(
        { description: 'once', grantRole: 'user', maximumUses: 1 },
        'admin-reg'
      );
      const first = `reg-u1-${randomUUID()}`;
      await syncAuthenticatedAppUser({
        uid: first,
        email: `${first}@once.test`,
        inviteCode: invite.code,
        legalAcceptance: currentDraftLegalAcceptanceInput(),
      });
      const second = `reg-u2-${randomUUID()}`;
      await assert.rejects(
        () =>
          syncAuthenticatedAppUser({
            uid: second,
            email: `${second}@once.test`,
            inviteCode: invite.code,
            legalAcceptance: currentDraftLegalAcceptanceInput(),
          }),
        isInviteBlocked
      );
      assert.ok(await getUserById(first));
      assert.equal(await getUserById(second), null);
    });
  });

  it('parallel single-use invite creates only one account', async () => {
    await withRegistrationMode('invite_only', async () => {
      const invite = await createInviteCode(
        { description: 'race', grantRole: 'user', maximumUses: 1 },
        'admin-reg'
      );
      const a = `reg-r1-${randomUUID()}`;
      const b = `reg-r2-${randomUUID()}`;
      const settled = await Promise.allSettled([
        syncAuthenticatedAppUser({
          uid: a,
          email: `${a}@race.test`,
          inviteCode: invite.code,
          legalAcceptance: currentDraftLegalAcceptanceInput(),
        }),
        syncAuthenticatedAppUser({
          uid: b,
          email: `${b}@race.test`,
          inviteCode: invite.code,
          legalAcceptance: currentDraftLegalAcceptanceInput(),
        }),
      ]);
      const ok = settled.filter((s) => s.status === 'fulfilled').length;
      assert.equal(ok, 1);
      const created = [await getUserById(a), await getUserById(b)].filter(Boolean);
      assert.equal(created.length, 1);
      assert.equal((await getInviteByCode(invite.code))?.currentUses, 1);
    });
  });

  it('REGISTRATION_MODE=public allows new users without invite', async () => {
    await withRegistrationMode('public', async () => {
      const uid = `reg-pub-${randomUUID()}`;
      const result = await syncAuthenticatedAppUser({
        uid,
        email: `${uid}@pub.test`,
        displayName: 'Public',
        authProvider: 'email',
        legalAcceptance: currentDraftLegalAcceptanceInput(),
      });
      assert.equal(result.created, true);
      assert.equal(result.user.id, uid);
    });
  });

  it('public validate-invite does not leak invite metadata', async () => {
    const invite = await createInviteCode({ description: 'hidden', maximumUses: 1 }, 'admin-reg');
    const result = await validateInviteCode(invite.code);
    assert.equal(result.valid, true);
    assert.equal('grantRole' in result, false);
    assert.equal('message' in result, false);
    const invalid = await validateInviteCode('NOPE');
    assert.deepEqual(invalid, { valid: false });
  });

  it('API gates and frontend keep invite-only as UX only', () => {
    const authMw = src('src/middleware/auth.ts');
    assert.match(authMw, /Konto noch nicht freigeschaltet/);
    assert.match(authMw, /getUserById\(decoded\.uid\)/);

    const routes = src('src/routes/auth.routes.ts');
    assert.match(routes, /syncAuthenticatedAppUser/);
    assert.match(routes, /authenticateAllowUnprovisioned/);
    assert.match(routes, /\/onboarding\/complete/);
    const onboarding = routes.slice(routes.indexOf('/onboarding/complete'));
    assert.match(src('src/routes/auth.routes.ts'), /authenticate,/);

    const gate = src('src/services/auth-registration.service.ts');
    assert.match(gate, /mode !== 'public'/);
    assert.match(gate, /getUserById\(input\.uid\)/);

    const protectedRoute = repo('frontend/src/components/auth/ProtectedRoute.tsx');
    assert.match(protectedRoute, /Navigate to="\/login"/);

    const landing = repo('frontend/src/pages/landing/LandingPage.tsx');
    assert.match(landing, /Mit Einladung starten/);
    assert.match(landing, /registrationStatus/);

    const login = repo('frontend/src/pages/auth/LoginPage.tsx');
    assert.match(login, /inviteRequired/);
    assert.match(login, /pending_invite_code/);

    const ctx = repo('frontend/src/context/AuthContext.tsx');
    assert.match(ctx, /ACCESS_DENIED/);
    assert.match(ctx, /logoutFirebase/);

    const rules = repo('firestore.rules');
    assert.match(rules, /match \/\{document=\*\*\}/);
    const catchAll = rules.slice(rules.lastIndexOf('match /{document=**}'));
    assert.match(catchAll, /allow read, write: if false/);
  });
});
