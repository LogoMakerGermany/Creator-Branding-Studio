import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UserRole, currentDraftLegalAcceptanceInput } from '@ucbs/shared';
import { AppError } from '../middleware/errorHandler.js';
import { ServiceError } from '../lib/errors.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { arePaymentsEnabled, collectProductionConfigIssues, normalizeRegistrationMode } from '../config/env.js';
import {
  isEmailVerificationExemptPath,
  passwordProviderNeedsEmailVerification,
} from '../lib/email-verification.js';
import {
  AUTH_GATE_PATH,
  isPathAllowedForGate,
  passwordProviderNeedsEmailVerification as frontendPasswordGate,
  resolveAuthGate,
} from '../../../frontend/src/lib/auth-gates.ts';
import { formatAuthError } from '../../../frontend/src/lib/auth-errors.ts';
import { getOrCreateUser, getUserById, updateOwnProfile, updateUser } from './user.service.js';
import { getCoinBalance, getTransactions } from './coins.service.js';
import { upsertDna, getActiveDna } from './dna.service.js';
import { createInviteCode } from './invite.service.js';
import { syncAuthenticatedAppUser } from './auth-registration.service.js';
import { updateNexterPreferencesForUser } from './nexter/preferences.service.js';
import { buildNexterContext } from './nexter/context.service.js';
import { listPublicNexterVoices } from './nexter/voice-catalog.service.js';
import { getRegistrationMode } from './system-settings.service.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, '../..');
const repoRoot = join(dir, '../../..');

function src(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

describe('auth & onboarding local closure — gates, verification, identity', () => {
  it('gate order: login → verify-email → DNA → nexter-setup → app', () => {
    assert.equal(resolveAuthGate(null), 'login');
    assert.equal(resolveAuthGate({ needsEmailVerification: true, onboardingCompleted: true }), 'verify-email');
    assert.equal(resolveAuthGate({ onboardingCompleted: false }), 'onboarding');
    assert.equal(
      resolveAuthGate({
        onboardingCompleted: true,
        nexterPreferences: { personalizationCompleted: false },
      }),
      'nexter-setup'
    );
    assert.equal(
      resolveAuthGate({
        onboardingCompleted: true,
        nexterPreferences: { personalizationCompleted: true },
      }),
      'app'
    );
    assert.equal(AUTH_GATE_PATH.app, '/dashboard');
    assert.equal(isPathAllowedForGate('/logo-studio', 'onboarding'), false);
    assert.equal(isPathAllowedForGate('/projects', 'verify-email'), false);
    assert.equal(isPathAllowedForGate('/verify-email', 'verify-email'), true);
    assert.equal(isPathAllowedForGate('/onboarding', 'onboarding'), true);
    assert.equal(isPathAllowedForGate('/nexter-setup', 'nexter-setup'), true);
    assert.equal(isPathAllowedForGate('/admin', 'onboarding'), false);
    assert.equal(isPathAllowedForGate('/legal/privacy', 'verify-email'), true);
    assert.equal(isPathAllowedForGate('/dashboard', 'app'), true);
  });

  it('emailVerified comes from Firebase token semantics, not a client field', () => {
    assert.equal(passwordProviderNeedsEmailVerification('password', false), true);
    assert.equal(passwordProviderNeedsEmailVerification('password', true), false);
    assert.equal(passwordProviderNeedsEmailVerification('google.com', false), false);
    assert.equal(passwordProviderNeedsEmailVerification('dev', false), false);
    assert.equal(frontendPasswordGate('password', false), true);
    assert.equal(isEmailVerificationExemptPath('GET', '/api/v1', '/auth/me'), true);
    assert.equal(isEmailVerificationExemptPath('GET', '/api/v1', '/auth/export'), true);
    assert.equal(isEmailVerificationExemptPath('POST', '/api/v1', '/auth/account/delete'), true);
    assert.equal(isEmailVerificationExemptPath('POST', '/api/v1', '/auth/sync'), false);
    assert.equal(isEmailVerificationExemptPath('POST', '/api/v1', '/logo/generate'), false);

    const mw = src('src/middleware/auth.ts');
    assert.match(mw, /EMAIL_NOT_VERIFIED/);
    assert.match(mw, /decoded\.uid/);
    assert.match(mw, /AUTH_REQUIRED/);
    assert.match(mw, /INVALID_TOKEN/);
    assert.doesNotMatch(mw, /req\.body\.userId/);
    assert.match(src('src/routes/auth.routes.ts'), /needsEmailVerification/);
    assert.match(src('src/routes/auth.routes.ts'), /req\.authToken\?\.emailVerified === true/);
    assert.match(src('src/config/firebase.ts'), /sign_in_provider: 'dev'/);
  });

  it('verification UI: refresh, resend cooldown, no studios, existing user states', () => {
    const page = repo('frontend/src/pages/auth/VerifyEmailPage.tsx');
    const routes = repo('frontend/src/routes/index.tsx');
    const settings = repo('frontend/src/v2/pages/SettingsHubPage.tsx');
    const gate = repo('frontend/src/components/auth/ProtectedRoute.tsx');
    const firebase = repo('frontend/src/lib/firebase.ts');
    assert.match(routes, /\/verify-email/);
    assert.match(page, /reloadCurrentUserAndToken/);
    assert.match(page, /resendEmailVerification/);
    assert.match(page, /RESEND_COOLDOWN_MS = 60_000/);
    assert.match(page, /Ich habe meine E-Mail bestätigt/);
    assert.match(page, /Mail erneut senden/);
    assert.match(page, /logout/);
    assert.equal(page.includes('/logo'), false);
    assert.equal(page.includes('/coins'), false);
    assert.match(firebase, /currentUser\.reload\(\)/);
    assert.match(firebase, /getIdToken\(true\)/);
    assert.doesNotMatch(repo('frontend/src/context/AuthContext.tsx'), /getIdToken\(true\)/);
    assert.match(gate, /resolveAuthGate/);
    assert.equal(gate.includes("startsWith('/admin')"), false);
    assert.doesNotMatch(settings, /die App erzwingt das derzeit nicht/);
  });
});

describe('auth & onboarding local closure — registration, invite, sync, coins', () => {
  it('registration mode fail-safe remains invite_only', async () => {
    assert.equal(normalizeRegistrationMode(undefined), 'invite_only');
    assert.equal(normalizeRegistrationMode(''), 'invite_only');
    assert.equal(await getRegistrationMode(), 'invite_only');
    const status = src('src/routes/auth.routes.ts');
    assert.match(status, /\/registration-status/);
    assert.match(status, /inviteRequired: mode !== 'public' && mode !== 'closed'/);
    assert.equal(status.includes('listInviteCodes'), false);
  });

  it('valid login identity, invite policy, google reuse, welcome bonus once, sync race', async () => {
    const existing = await getOrCreateUser(`ao-exist-${randomUUID()}`, 'exist@ao.test', 'Exist');
    await updateUser(existing.id, {
      onboardingCompleted: true,
      nexterPreferences: {
        ...existing.nexterPreferences,
        personalizationCompleted: true,
        addressAs: 'Exist',
      },
    });
    const relogin = await syncAuthenticatedAppUser({
      uid: existing.id,
      email: existing.email,
      displayName: 'Exist',
      authProvider: 'google',
    });
    assert.equal(relogin.created, false);
    assert.equal(relogin.user.id, existing.id);
    const coinsAfterRelogin = await getCoinBalance(existing.id);
    assert.equal(coinsAfterRelogin, existing.coinBalance);

    await assert.rejects(
      () =>
        syncAuthenticatedAppUser({
          uid: `ao-new-${randomUUID()}`,
          email: 'new-google@ao.test',
          displayName: 'New Google',
          authProvider: 'google',
        }),
      (err: unknown) => err instanceof AppError && err.code === 'ACCESS_DENIED'
    );

    const admin = await getOrCreateUser(`ao-admin-${randomUUID()}`, 'admin@ao.test', 'Admin', {
      role: UserRole.ADMIN,
    });
    const invite = await createInviteCode({ description: 'ao-valid', maximumUses: 1 }, admin.id);
    const created = await syncAuthenticatedAppUser({
      uid: `ao-inv-${randomUUID()}`,
      email: 'invited@ao.test',
      displayName: 'Invited',
      inviteCode: invite.code,
      authProvider: 'email',
      legalAcceptance: currentDraftLegalAcceptanceInput(),
    });
    assert.equal(created.created, true);
    const welcome = (await getTransactions(created.user.id)).filter(
      (tx) => tx.idempotencyKey === `welcome:${created.user.id}` || tx.type === 'bonus'
    );
    assert.equal(welcome.length <= 1, true);
    const firstBalance = await getCoinBalance(created.user.id);

    const again = await syncAuthenticatedAppUser({
      uid: created.user.id,
      email: created.user.email,
      displayName: 'Invited',
      inviteCode: invite.code,
      authProvider: 'email',
    });
    assert.equal(again.created, false);
    assert.equal(await getCoinBalance(created.user.id), firstBalance);

    await assert.rejects(
      () =>
        syncAuthenticatedAppUser({
          uid: `ao-reuse-${randomUUID()}`,
          email: 'reuse@ao.test',
          inviteCode: invite.code,
          legalAcceptance: currentDraftLegalAcceptanceInput(),
        }),
      (err: unknown) =>
        (err instanceof AppError || err instanceof ServiceError) && err.code === 'ACCESS_DENIED'
    );

    const uid = `ao-race-${randomUUID()}`;
    const [a, b] = await Promise.all([
      getOrCreateUser(uid, `${uid}@ao.test`, 'Race'),
      getOrCreateUser(uid, `${uid}@ao.test`, 'Race'),
    ]);
    assert.equal(a.id, b.id);
    assert.equal(await getCoinBalance(uid), a.coinBalance);
    const welcomeTx = (await getTransactions(uid)).filter((tx) => tx.idempotencyKey === `welcome:${uid}`);
    assert.equal(welcomeTx.length <= 1, true);
  });

  it('DNA completion requires saved DNA; personalization flag is not a skip', async () => {
    const user = await getOrCreateUser(`ao-dna-${randomUUID()}`, 'dna@ao.test', 'Dna');
    assert.equal(await getActiveDna(user.id), null);
    assert.match(src('src/routes/auth.routes.ts'), /NO_DNA/);
    const dna = await upsertDna({
      userId: user.id,
      name: 'Dna',
      styleDirection: 'neon',
      primaryColors: ['#1E40AF'],
    });
    assert.equal((await getActiveDna(user.id))?.id, dna.id);
    await updateUser(user.id, { onboardingCompleted: true });
    assert.equal((await getUserById(user.id))?.onboardingCompleted, true);

    await assert.rejects(
      () => updateNexterPreferencesForUser(user.id, { personalizationCompleted: true }),
      (err: unknown) => err instanceof ServiceError && err.code === 'INCOMPLETE_PERSONALIZATION'
    );
    const saved = await updateNexterPreferencesForUser(user.id, {
      addressAs: 'Dna',
      language: 'de',
      personalizationCompleted: true,
      uiTheme: 'dark',
    });
    assert.equal(saved.nexterPreferences.personalizationCompleted, true);

    const ctx = await buildNexterContext(user.id);
    assert.equal(ctx.addressAs, 'Dna');
    assert.equal(ctx.language, 'de');
    const voices = await listPublicNexterVoices();
    assert.equal(voices.length > 0, true);
  });
});

describe('auth & onboarding local closure — frontend contracts & safety', () => {
  it('token flow stays Firebase SDK; leftover localStorage is not preferred', () => {
    const ctx = repo('frontend/src/context/AuthContext.tsx');
    const firebase = repo('frontend/src/lib/firebase.ts');
    const session = repo('frontend/src/lib/auth-session.ts');
    const api = repo('frontend/src/services/api.ts');
    assert.match(ctx, /onIdTokenChanged|subscribeToAuth/);
    assert.match(firebase, /onIdTokenChanged/);
    assert.match(firebase, /currentUser\.getIdToken\(\)/);
    assert.match(session, /resolveAuthRequestToken/);
    assert.match(api, /resolveAuthRequestToken/);
    assert.doesNotMatch(ctx, /getIdToken\(true\)/);
    assert.match(ctx, /isFatalAuthError/);
    assert.match(ctx, /profileLoadError/);
    assert.match(ctx, /hasFirebaseSession/);
    assert.match(ctx, /await logoutFirebase\(\)/);
  });

  it('unsupported OAuth is not a fake login; google remains the working provider', () => {
    const login = repo('frontend/src/pages/auth/LoginPage.tsx');
    const ctx = repo('frontend/src/context/AuthContext.tsx');
    assert.match(login, /available: true/);
    assert.match(login, /nicht verfügbar/);
    assert.match(login, /id: 'google'/);
    assert.match(ctx, /provider !== 'google'/);
    assert.match(login, /autoComplete="email"/);
    assert.match(login, /current-password/);
    assert.match(login, /Falls ein Konto existiert/);
    assert.match(login, /role="alert"/);
  });

  it('auth error mapping avoids stack traces and account enumeration', () => {
    assert.equal(formatAuthError({ code: 'auth/user-not-found', message: 'nope' }), 'E-Mail oder Passwort ist falsch.');
    assert.equal(formatAuthError({ code: 'auth/wrong-password', message: 'nope' }), 'E-Mail oder Passwort ist falsch.');
    assert.match(formatAuthError({ code: 'auth/too-many-requests', message: 'x' }), /Zu viele/);
    assert.match(formatAuthError({ code: 'EMAIL_NOT_VERIFIED', message: 'x' }), /E-Mail/);
    assert.match(formatAuthError({ code: 'INVALID_TOKEN', message: 'x' }), /Sitzung/);
    const err = new Error(`TypeError: at Object.foo\n${'x'.repeat(200)}`);
    assert.equal(formatAuthError(err).includes('at Object'), false);
  });

  it('password change, reset, logout, loading, a11y, no secret/token/password leaks', () => {
    const firebase = repo('frontend/src/lib/firebase.ts');
    const settings = repo('frontend/src/v2/pages/SettingsHubPage.tsx');
    const ctx = repo('frontend/src/context/AuthContext.tsx');
    const login = repo('frontend/src/pages/auth/LoginPage.tsx');
    const verify = repo('frontend/src/pages/auth/VerifyEmailPage.tsx');
    const onboarding = repo('frontend/src/pages/onboarding/OnboardingPage.tsx');
    const setup = repo('frontend/src/pages/onboarding/NexterSetupPage.tsx');
    const api = repo('frontend/src/services/api.ts');
    assert.match(firebase, /changeAccountPassword/);
    assert.match(firebase, /reauthenticateWithCredential/);
    assert.match(firebase, /sendPasswordResetEmail/);
    assert.match(settings, /Neues Passwort/);
    assert.match(settings, /autoComplete="current-password"/);
    assert.match(ctx, /setUser\(null\)/);
    assert.match(login, /min-h-11/);
    assert.match(verify, /min-h-11/);
    assert.match(onboarding, /min-h-11|label=/);
    assert.match(setup, /applyNexterAppearance\(user\?\.nexterPreferences\)/);
    assert.match(setup, /personalizationCompleted: true/);
    assert.match(onboarding, /api\.dna\.active/);
    assert.match(onboarding, /completeOnboarding/);
    assert.doesNotMatch(firebase, /console\.(log|debug|info)\(.*password/i);
    assert.doesNotMatch(ctx, /console\.(log|debug|info)\(.*token/i);
    assert.doesNotMatch(api, /localStorage\.setItem\([^)]*password/i);
    assert.equal(repo('frontend/src/context/AuthContext.tsx').includes('FIREBASE_PRIVATE_KEY'), false);
    assert.equal(api.includes('FIREBASE_PRIVATE_KEY'), false);
    assert.equal(login.includes('FIREBASE_PRIVATE_KEY'), false);
  });

  it('DEV_AUTH_BYPASS stays blocked in production; production hides dev login', () => {
    const issues = collectProductionConfigIssues.toString();
    assert.match(src('src/config/env.ts'), /must not be enabled in production/);
    assert.match(src('src/config/env.ts'), /isDevAuthBypassExplicit/);
    assert.match(src('src/routes/status.routes.ts'), /devLogin: isProduction\(\) \? false/);
    assert.match(repo('frontend/src/pages/auth/LoginPage.tsx'), /showDevLogin/);
    assert.match(repo('frontend/src/pages/auth/LoginPage.tsx'), /status\.features\.devLogin/);
    assert.equal(typeof issues, 'string');
  });

  it('no client user/storage writes, no providers, no payments, account delete/export stay auth-bound', async () => {
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    const user = await getOrCreateUser(`ao-own-${randomUUID()}`, 'own@ao.test', 'Own');
    await assert.rejects(
      () => updateOwnProfile(user.id, { coinBalance: 99999 }),
      (err: unknown) => err instanceof ServiceError && err.code === 'FORBIDDEN_FIELD'
    );
    const frontendSrc = [
      repo('frontend/src/context/AuthContext.tsx'),
      repo('frontend/src/pages/auth/LoginPage.tsx'),
      repo('frontend/src/pages/onboarding/OnboardingPage.tsx'),
      repo('frontend/src/pages/onboarding/NexterSetupPage.tsx'),
      repo('frontend/src/pages/auth/VerifyEmailPage.tsx'),
      repo('frontend/src/v2/pages/SettingsHubPage.tsx'),
    ].join('\n');
    assert.equal(frontendSrc.includes("from 'firebase/firestore'"), false);
    assert.equal(frontendSrc.includes("from 'firebase/storage'"), false);
    assert.equal(frontendSrc.includes('uploadBytes'), false);
    assert.equal(frontendSrc.includes('stripe.checkout'), false);
    assert.equal(frontendSrc.includes('api.stripe.com'), false);
    const rules = repo('firestore.rules');
    assert.match(rules, /allow create, update, delete: if false/);
    const storage = repo('storage.rules');
    assert.match(storage, /allow read, write: if false/);
    const authRoutes = src('src/routes/auth.routes.ts');
    assert.match(authRoutes, /exportAccountData\(req\.user!\.uid\)/);
    assert.match(authRoutes, /requestAccountDeletion\(req\.user!\.uid/);
    assert.match(authRoutes, /authenticate,/);
  });
});
