import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from '../middleware/errorHandler.js';
import { arePaymentsEnabled, getFirebaseProjectConsistency, getCustomEmailProviderStatus } from '../config/env.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import {
  isEmailVerificationExemptPath,
  passwordProviderNeedsEmailVerification,
} from '../lib/email-verification.js';
import {
  authorizeVerificationResend,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
} from './email-verification-resend.service.js';
import {
  dispatchTransactionalEmail,
  inviteEmail,
  maskEmailAddress,
  sendTransactionalEmail,
  welcomeEmail,
} from './email.service.js';
import { getAdminSystemStatus } from './admin.service.js';
import { formatAuthError } from '../../../frontend/src/lib/auth-errors.ts';
import {
  authActionContinueUrl,
  isAllowedAuthContinueUrl,
} from '../../../frontend/src/lib/auth-action-url.ts';
import { resolveAuthGate } from '../../../frontend/src/lib/auth-gates.ts';
import { requestAccountDeletion, ACCOUNT_DELETE_CONFIRMATION, exportAccountData } from './account.service.js';
import { getOrCreateUser } from './user.service.js';

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

describe('email delivery local closure', () => {
  const firebase = repo('frontend/src/lib/firebase.ts');
  const verify = repo('frontend/src/pages/auth/VerifyEmailPage.tsx');
  const login = repo('frontend/src/pages/auth/LoginPage.tsx');
  const settings = repo('frontend/src/v2/pages/SettingsHubPage.tsx');
  const errors = repo('frontend/src/lib/auth-errors.ts');
  const actionUrl = repo('frontend/src/lib/auth-action-url.ts');
  const emailSvc = src('src/services/email.service.ts');
  const authRoutes = src('src/routes/auth.routes.ts');
  const mw = src('src/middleware/auth.ts');
  const gates = repo('frontend/src/lib/auth-gates.ts');
  const api = repo('frontend/src/services/api.ts');
  const adminPage = repo('frontend/src/pages/admin/AdminPage.tsx');
  const registration = src('src/services/auth-registration.service.ts');
  const account = src('src/services/account.service.ts');

  it('verification flow, gate, google skip, and invite-only stay on the existing auth system', () => {
    assert.match(firebase, /sendEmailVerification/);
    assert.match(firebase, /createUserWithEmailAndPassword/);
    assert.match(firebase, /resendEmailVerification/);
    assert.match(firebase, /EMAIL_VERIFICATION_SEND_ERROR_KEY/);
    assert.match(firebase, /rememberEmailVerificationSendError/);
    assert.doesNotMatch(firebase, /Registration still succeeds; VerifyEmailPage can resend/);
    assert.match(verify, /EMAIL_VERIFICATION_SEND_ERROR_KEY/);
    assert.doesNotMatch(verify, /Wir haben eine Bestätigungs-Mail/);
    assert.match(verify, /resendEmailVerification/);
    assert.match(verify, /requestVerificationResend/);
    assert.match(verify, /reloadCurrentUserAndToken/);
    assert.match(mw, /EMAIL_NOT_VERIFIED/);
    assert.equal(
      isEmailVerificationExemptPath('GET', '/api/v1/auth', '/me'),
      true
    );
    assert.equal(
      isEmailVerificationExemptPath('POST', '/api/v1/auth', '/email-verification/resend'),
      true
    );
    assert.equal(
      isEmailVerificationExemptPath('GET', '/api/v1/logo', '/generate'),
      false
    );
    assert.equal(passwordProviderNeedsEmailVerification('password', false), true);
    assert.equal(passwordProviderNeedsEmailVerification('password', true), false);
    assert.equal(passwordProviderNeedsEmailVerification('google.com', false), false);
    assert.match(gates, /verify-email/);
    assert.equal(
      resolveAuthGate({
        needsEmailVerification: true,
        onboardingCompleted: false,
        nexterPreferences: { personalizationCompleted: false },
      }),
      'verify-email'
    );
    assert.equal(
      resolveAuthGate({
        needsEmailVerification: false,
        onboardingCompleted: true,
        nexterPreferences: { personalizationCompleted: true },
      }),
      'app'
    );
    assert.match(authRoutes, /inviteRequired: mode !== 'public' && mode !== 'closed'/);
    assert.match(registration, /assertNewUserLegalAcceptance/);
    assert.doesNotMatch(src('src/services/email-verification-resend.service.ts'), /syncAuthenticatedAppUser/);
    assert.doesNotMatch(src('src/services/email-verification-resend.service.ts'), /legalAcceptance/);
    assert.doesNotMatch(src('src/services/email-verification-resend.service.ts'), /addCoins|Willkommensbonus/);
  });

  it('resend is authenticated, skips already-verified, and enforces server cooldown plus double-click lock', async () => {
    await assert.rejects(
      () => authorizeVerificationResend({ uid: 'u1', emailVerified: true, signInProvider: 'password' }),
      (err: unknown) => err instanceof AppError && err.code === 'EMAIL_ALREADY_VERIFIED'
    );
    await assert.rejects(
      () =>
        authorizeVerificationResend({
          uid: 'u2',
          emailVerified: false,
          signInProvider: 'google.com',
        }),
      (err: unknown) => err instanceof AppError && err.code === 'EMAIL_VERIFICATION_NOT_REQUIRED'
    );

    const uid = `ev-${randomUUID()}`;
    const first = await authorizeVerificationResend({
      uid,
      emailVerified: false,
      signInProvider: 'password',
    });
    assert.equal(first.allowed, true);
    await assert.rejects(
      () => authorizeVerificationResend({ uid, emailVerified: false, signInProvider: 'password' }),
      (err: unknown) => err instanceof AppError && err.statusCode === 429 && err.code === 'RATE_LIMIT'
    );

    const uid2 = `ev2-${randomUUID()}`;
    const settled = await Promise.allSettled([
      authorizeVerificationResend({ uid: uid2, emailVerified: false, signInProvider: 'password' }),
      authorizeVerificationResend({ uid: uid2, emailVerified: false, signInProvider: 'password' }),
    ]);
    assert.equal(settled.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(settled.filter((r) => r.status === 'rejected').length, 1);
    assert.equal(EMAIL_VERIFICATION_RESEND_COOLDOWN_MS, 60_000);
    assert.match(verify, /RESEND_COOLDOWN_MS = 60_000/);
    assert.match(verify, /sending \|\| remainingCooldown/);
    assert.match(firebase, /currentUser\.emailVerified/);
    assert.match(authRoutes, /authenticate/);
    assert.match(authRoutes, /email-verification\/resend/);
  });

  it('password reset is enumeration-safe, password change is reused, email change stays unimplemented', () => {
    assert.match(firebase, /sendPasswordResetEmail/);
    assert.match(firebase, /auth\/user-not-found/);
    assert.match(login, /Falls ein Konto existiert, wurde eine Reset-E-Mail gesendet/);
    assert.match(firebase, /changeAccountPassword/);
    assert.match(firebase, /updatePassword/);
    assert.doesNotMatch(firebase, /\bupdateEmail\b/);
    assert.doesNotMatch(firebase, /verifyBeforeUpdateEmail/);
    assert.match(settings, /kann hier nicht geändert werden/);
    assert.doesNotMatch(settings, /E-Mail ändern/);
    assert.equal(formatAuthError({ code: 'auth/user-not-found', message: 'nope' }), 'E-Mail oder Passwort ist falsch.');
    assert.match(formatAuthError({ code: 'auth/invalid-email', message: 'x' }), /gültige E-Mail/);
    assert.match(formatAuthError({ code: 'auth/too-many-requests', message: 'x' }), /Zu viele/);
    assert.match(formatAuthError({ code: 'auth/user-disabled', message: 'x' }), /deaktiviert/);
    assert.match(formatAuthError({ code: 'auth/expired-action-code', message: 'x' }), /abgelaufen/);
    assert.match(formatAuthError({ code: 'auth/invalid-action-code', message: 'x' }), /ungültig/);
    assert.match(formatAuthError({ code: 'auth/network-request-failed', message: 'x' }), /nicht gesendet/);
    assert.match(formatAuthError({ code: 'auth/unauthorized-continue-uri', message: 'x' }), /nicht autorisiert/);
    assert.match(formatAuthError({ code: 'auth/invalid-continue-uri', message: 'x' }), /nicht autorisiert/);
    assert.match(formatAuthError({ code: 'EMAIL_ALREADY_VERIFIED', message: 'x' }), /bereits bestätigt/);
    assert.match(formatAuthError({ code: 'AUTH_REQUIRED', message: 'x' }), /Sitzung/);
    assert.equal(errors.includes('creatorbrandingstudioultimate-production.up.railway.app'), false);
    const retiredHost = 'creatorbrandingstudioultimate-production.up.railway.app';
    assert.equal(
      formatAuthError({ code: 'auth/unauthorized-domain', message: retiredHost }).includes(retiredHost),
      false
    );
    assert.equal(login.includes(retiredHost), false);
    assert.equal(login.includes("'github'"), false);
    assert.equal(login.includes("'apple'"), false);
  });

  it('action continue URLs are environment-aware and reject open redirects', () => {
    assert.equal(authActionContinueUrl('/verify-email'), '/verify-email');
    assert.equal(authActionContinueUrl('/login'), '/login');
    assert.equal(authActionContinueUrl('https://evil.example/phish'), '/');
    assert.equal(authActionContinueUrl('//evil.example'), '/');
    assert.equal(isAllowedAuthContinueUrl('/verify-email'), true);
    assert.equal(isAllowedAuthContinueUrl('https://evil.example/login'), false);
    assert.equal(isAllowedAuthContinueUrl('https://evil.example/verify-email'), false);
    assert.match(firebase, /authActionContinueUrl\('\/verify-email'\)/);
    assert.match(firebase, /authActionContinueUrl\('\/login'\)/);
    assert.doesNotMatch(firebase, /location\.search/);
    assert.doesNotMatch(firebase, /URLSearchParams/);
    assert.doesNotMatch(actionUrl, /continueUrl/);
    assert.match(actionUrl, /window\.location\.origin/);
  });

  it('production continue URLs use the current origin and reject the old Firebase project', () => {
    const origin = 'https://nexter-creator-studio.firebaseapp.com';
    const retiredHost = 'creatorbrandingstudioultimate-production.up.railway.app';
    const retiredAuthHost = `https://${['creatorstudio', '519eb'].join('-')}.firebaseapp.com/login`;
    const retiredNeedle = ['creatorstudio', '519eb'].join('-');
    const g = globalThis as { window?: { location: { origin: string } } };
    const prev = g.window;
    g.window = { location: { origin } };
    try {
      assert.equal(authActionContinueUrl('/verify-email'), `${origin}/verify-email`);
      assert.equal(authActionContinueUrl('/login'), `${origin}/login`);
      assert.equal(isAllowedAuthContinueUrl(`${origin}/verify-email`), true);
      assert.equal(isAllowedAuthContinueUrl(`${origin}/login`), true);
      assert.equal(isAllowedAuthContinueUrl(retiredAuthHost), false);
      assert.equal(isAllowedAuthContinueUrl('http://localhost:5173/verify-email'), false);
    } finally {
      if (prev === undefined) delete g.window;
      else g.window = prev;
    }
    assert.equal(repo('backend/src/config/env.ts').includes(retiredHost), false);
    assert.equal(repo('backend/.env.railway.example').includes(retiredHost), false);
    assert.equal(actionUrl.includes(retiredNeedle), false);
    assert.doesNotMatch(actionUrl, /localhost:5173/);
    assert.equal(firebase.includes(retiredNeedle), false);
    assert.doesNotMatch(firebase, /localhost:5173/);
  });

  it('network/loading/success states and VerifyEmailPage accessibility', () => {
    assert.match(verify, /setStatus\(null\)/);
    assert.match(verify, /await resendEmailVerification/);
    assert.match(verify, /user\.email/);
    assert.match(verify, /aria-live/);
    assert.match(verify, /role="alert"/);
    assert.match(verify, /min-h-11/);
    assert.match(verify, /sm:flex-row/);
    assert.match(verify, /E-Mail-Änderung ist hier nicht verfügbar/);
    assert.match(login, /autoComplete="email"/);
    assert.match(login, /aria-describedby/);
    assert.match(login, /aria-live="assertive"/);
    assert.match(login, /loading=\{loading\}/);
    assert.match(settings, /autoComplete="email"/);
    assert.match(settings, /E-Mail-Status \(Firebase\)/);
    assert.match(api, /NETWORK_ERROR/);
  });

  it('custom Resend provider never runs in tests; transactional inventory stays honest', async () => {
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.match(emailSvc, /isPaidProviderTestBlocked/);
    assert.equal(emailSvc.includes('noreply@nexter.studio'), false);
    assert.match(emailSvc, /maskEmailAddress/);
    assert.equal(maskEmailAddress('creator@example.com'), 'c***@example.com');

    const prev = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = 're_fake_not_a_real_key';
    let fetchCalled = false;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (..._args: Parameters<typeof fetch>) => {
      fetchCalled = true;
      throw new Error('unexpected provider call');
    }) as typeof fetch;
    try {
      const result = await sendTransactionalEmail(welcomeEmail('a@b.test', 'Ada'));
      assert.equal(result.provider, 'test');
      assert.equal(fetchCalled, false);
    } finally {
      globalThis.fetch = origFetch;
      if (prev === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = prev;
    }

    const key = `welcome:ed-${randomUUID()}`;
    const w1 = await dispatchTransactionalEmail(key, welcomeEmail('a@b.test', 'Ada'));
    const w2 = await dispatchTransactionalEmail(key, welcomeEmail('a@b.test', 'Ada'));
    assert.equal(w1.duplicate, false);
    assert.equal(w2.duplicate, true);

    const injected = welcomeEmail('a@b.test', 'X\nBcc: evil@x');
    assert.equal(injected.text.includes('\nBcc:'), false);
    assert.equal(inviteEmail('a@b.test', 'CODE01', 'desc').kind, 'invite');
    assert.match(emailSvc, /kind: 'welcome'/);
    assert.match(emailSvc, /kind: 'invite'/);
    assert.match(emailSvc, /kind: 'purchase'/);
    assert.doesNotMatch(src('src/services/ai.service.ts'), /dispatchTransactionalEmail/);
    assert.doesNotMatch(src('src/services/coins.service.ts'), /dispatchTransactionalEmail/);
    assert.doesNotMatch(account, /dispatchTransactionalEmail|sendTransactionalEmail/);
    assert.match(registration, /welcome:\$\{input\.uid\}/);
    assert.match(src('src/routes/admin.routes.ts'), /inviteEmail/);
    assert.equal(arePaymentsEnabled(), false);
    assert.match(src('src/services/payment-credit.service.ts'), /purchaseReceiptEmail/);
  });

  it('secrets, tokens, action codes and provider keys are not exposed in email/auth paths', () => {
    assert.doesNotMatch(firebase, /console\.(log|debug|info|warn)\(.*err/);
    assert.match(emailSvc, /maskEmailAddress\(payload\.to\)/);
    assert.doesNotMatch(emailSvc, /console\.(info|log).*payload\.text/);
    assert.doesNotMatch(firebase, /oobCode|actionCode|idToken|refreshToken|private_key/);
    assert.doesNotMatch(emailSvc, /oobCode|SMTP|private_key|FIREBASE_PRIVATE_KEY/);
    assert.doesNotMatch(src('src/routes/status.routes.ts'), /RESEND_API_KEY|EMAIL_FROM|getResendApiKey\(\)/);
    assert.doesNotMatch(src('src/services/admin.service.ts'), /getResendApiKey\(\)|getEmailFrom\(\)/);
    assert.match(adminPage, /Firebase Auth E-Mail/);
    assert.match(adminPage, /NOT CONFIGURED/);
    assert.doesNotMatch(adminPage, /re_/);
    assert.equal(getCustomEmailProviderStatus() === 'configured' || getCustomEmailProviderStatus() === 'not_configured', true);
  });

  it('provider status, firebase project consistency, account delete and export stay compatible', async () => {
    const system = await getAdminSystemStatus();
    assert.ok(system.email);
    assert.equal(system.email.customProvider, 'resend');
    assert.ok(system.email.firebaseAuthEmail === 'available' || system.email.firebaseAuthEmail === 'unavailable');
    assert.ok(system.email.customProviderStatus === 'configured' || system.email.customProviderStatus === 'not_configured');
    assert.ok(
      system.firebase.projectConsistency === 'ok' ||
        system.firebase.projectConsistency === 'mismatch' ||
        system.firebase.projectConsistency === 'not_verified'
    );
    assert.equal(getFirebaseProjectConsistency() === 'not_verified' || getFirebaseProjectConsistency() === 'ok' || getFirebaseProjectConsistency() === 'mismatch', true);
    assert.match(src('src/routes/status.routes.ts'), /firebaseAuthEmail/);
    assert.match(src('src/routes/status.routes.ts'), /customEmailProvider/);
    assert.equal(JSON.stringify(system).includes('BEGIN PRIVATE KEY'), false);
    assert.equal(JSON.stringify(system).includes('sk_live'), false);

    const user = await getOrCreateUser(`ed-del-${randomUUID()}`, 'ed-del@test.local', 'Del');
    const exported = await exportAccountData(user.id);
    assert.equal(JSON.stringify(exported).includes('RESEND_API_KEY'), false);
    await requestAccountDeletion(user.id, ACCOUNT_DELETE_CONFIRMATION);
    assert.doesNotMatch(account, /welcomeEmail|inviteEmail|purchaseReceiptEmail/);
  });

  it('no client Firestore/Storage writes, no payment calls, onboarding and Nexter gates unchanged', () => {
    assert.equal(verify.includes("from 'firebase/firestore'"), false);
    assert.equal(verify.includes("from 'firebase/storage'"), false);
    assert.equal(login.includes("from 'firebase/firestore'"), false);
    assert.equal(firebase.includes("from 'firebase/firestore'"), false);
    assert.equal(firebase.includes("from 'firebase/storage'"), false);
    assert.equal(arePaymentsEnabled(), false);
    assert.doesNotMatch(verify, /stripe|paypal|purchaseReceiptEmail/i);
    assert.match(gates, /onboarding/);
    assert.match(gates, /nexter-setup/);
    assert.match(repo('frontend/src/pages/onboarding/NexterSetupPage.tsx'), /personalizationCompleted/);
    assert.equal(isPaidProviderTestBlocked(), true);
  });
});
