import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  GithubAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  onIdTokenChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  type Auth,
  type User,
  type AuthProvider,
} from 'firebase/auth';
import { getFirebaseClientConfig, isFirebaseConfigured } from './runtime-config';
import type { AuthProviderId } from './auth-providers';
import { authActionContinueUrl } from './auth-action-url';

export { isFirebaseConfigured };
export type { AuthProviderId };

/** All OAuth providers use redirect — popups fail on Railway, mobile, and with strict COOP/CSP. */
const REDIRECT_PROVIDERS = new Set<AuthProviderId>([
  'google',
  'github',
  'apple',
  'microsoft',
  'discord',
  'twitch',
  'tiktok',
]);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

function getFirebaseConfig() {
  return getFirebaseClientConfig();
}

export function getFirebaseAuth(): Auth | null {
  if (!isFirebaseConfigured()) return null;
  const firebaseConfig = getFirebaseConfig();
  if (!firebaseConfig) return null;

  if (!app) {
    app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
  }
  if (!auth) {
    auth = getAuth(app);
  }
  return auth;
}

function providerFor(id: AuthProviderId): AuthProvider {
  switch (id) {
    case 'google':
      return new GoogleAuthProvider();
    case 'github':
      return new GithubAuthProvider();
    case 'apple': {
      const p = new OAuthProvider('apple.com');
      p.addScope('email');
      p.addScope('name');
      return p;
    }
    case 'microsoft': {
      const p = new OAuthProvider('microsoft.com');
      p.addScope('email');
      p.addScope('openid');
      p.addScope('profile');
      return p;
    }
    case 'discord':
      return new OAuthProvider('oidc.discord');
    case 'twitch':
      return new OAuthProvider('oidc.twitch');
    case 'tiktok':
      return new OAuthProvider('oidc.tiktok');
    default:
      throw new Error(`Unsupported OAuth provider: ${id}`);
  }
}

function isPopupAuthError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return code === 'auth/popup-closed-by-user' || code === 'auth/popup-blocked';
}

export async function completeRedirectLogin(): Promise<User | null> {
  const a = getFirebaseAuth();
  if (!a) return null;
  const result = await getRedirectResult(a);
  return result?.user ?? null;
}

export async function loginWithProvider(providerId: AuthProviderId): Promise<User> {
  const a = getFirebaseAuth();
  if (!a) throw new Error('Firebase nicht konfiguriert');
  const provider = providerFor(providerId);

  if (REDIRECT_PROVIDERS.has(providerId)) {
    await signInWithRedirect(a, provider);
    throw new Error('Weiterleitung zum Anbieter …');
  }

  try {
    const result = await signInWithPopup(a, provider);
    return result.user;
  } catch (err) {
    if (isPopupAuthError(err)) {
      await signInWithRedirect(a, provider);
      throw new Error('Weiterleitung zum Anbieter …');
    }
    throw err;
  }
}

/** @deprecated use loginWithProvider('google') */
export async function loginWithGoogle(): Promise<User> {
  return loginWithProvider('google');
}

/** @deprecated use loginWithProvider(id) */
export async function loginWithOAuth(providerId: string): Promise<User> {
  const a = getFirebaseAuth();
  if (!a) throw new Error('Firebase nicht konfiguriert');
  const result = await signInWithPopup(a, new OAuthProvider(providerId));
  return result.user;
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const a = getFirebaseAuth();
  if (!a) throw new Error('Firebase nicht konfiguriert');
  const result = await signInWithEmailAndPassword(a, email, password);
  return result.user;
}

/** Sanitized Firebase error code from the last verification send. Never stores messages or tokens. */
export const EMAIL_VERIFICATION_SEND_ERROR_KEY = 'nexter-verify-send-error';

function rememberEmailVerificationSendError(err: unknown): void {
  const code =
    typeof (err as { code?: string })?.code === 'string' && (err as { code: string }).code
      ? (err as { code: string }).code
      : 'auth/unknown';
  try {
    sessionStorage.setItem(EMAIL_VERIFICATION_SEND_ERROR_KEY, code);
  } catch {
    /* ignore storage failures */
  }
}

export function clearEmailVerificationSendError(): void {
  try {
    sessionStorage.removeItem(EMAIL_VERIFICATION_SEND_ERROR_KEY);
  } catch {
    /* ignore storage failures */
  }
}

export async function registerWithEmail(email: string, password: string): Promise<User> {
  const a = getFirebaseAuth();
  if (!a) throw new Error('Firebase nicht konfiguriert');
  const result = await createUserWithEmailAndPassword(a, email, password);
  try {
    await sendEmailVerification(result.user, {
      url: authActionContinueUrl('/verify-email'),
      handleCodeInApp: false,
    });
    clearEmailVerificationSendError();
  } catch (err) {
    rememberEmailVerificationSendError(err);
  }
  return result.user;
}

export async function resetPassword(email: string): Promise<void> {
  const a = getFirebaseAuth();
  if (!a) throw new Error('Firebase nicht konfiguriert');
  try {
    await sendPasswordResetEmail(a, email, {
      url: authActionContinueUrl('/login'),
      handleCodeInApp: false,
    });
  } catch (err) {
    const code = (err as { code?: string })?.code ?? '';
    if (code === 'auth/user-not-found') return;
    throw err;
  }
}

export async function resendEmailVerification(): Promise<void> {
  const a = getFirebaseAuth();
  if (!a?.currentUser) {
    const err = new Error('Sitzung abgelaufen. Bitte erneut anmelden.');
    (err as Error & { code: string }).code = 'AUTH_REQUIRED';
    throw err;
  }
  if (a.currentUser.emailVerified) {
    const err = new Error('Diese E-Mail ist bereits bestätigt.');
    (err as Error & { code: string }).code = 'EMAIL_ALREADY_VERIFIED';
    throw err;
  }
  await sendEmailVerification(a.currentUser, {
    url: authActionContinueUrl('/verify-email'),
    handleCodeInApp: false,
  });
  clearEmailVerificationSendError();
}

export async function logoutFirebase(): Promise<void> {
  const a = getFirebaseAuth();
  if (a) await signOut(a);
}

/**
 * Subscribe to sign-in, sign-out, and ID-token refresh.
 * `onIdTokenChanged` is the Firebase-supported hook for long-lived sessions.
 */
export function subscribeToAuth(callback: (user: User | null) => void): () => void {
  const a = getFirebaseAuth();
  if (!a) {
    callback(null);
    return () => {};
  }
  return onIdTokenChanged(a, callback);
}

/** Cached Firebase ID token; SDK refreshes when expired. Never force-refresh here. */
export async function getIdToken(): Promise<string | null> {
  const a = getFirebaseAuth();
  if (!a?.currentUser) return null;
  return a.currentUser.getIdToken();
}

/** Verification-page only: reload Auth user and mint a fresh ID token. */
export async function reloadCurrentUserAndToken(): Promise<{ emailVerified: boolean }> {
  const a = getFirebaseAuth();
  if (!a?.currentUser) throw new Error('Nicht angemeldet');
  await a.currentUser.reload();
  await a.currentUser.getIdToken(true);
  return { emailVerified: a.currentUser.emailVerified };
}

export async function changeAccountPassword(currentPassword: string, newPassword: string): Promise<void> {
  const a = getFirebaseAuth();
  const user = a?.currentUser;
  if (!user?.email) throw new Error('Passwort ändern ist nur für E-Mail-Konten verfügbar.');
  const cred = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, newPassword);
}

export const OAUTH_PROVIDERS = {
  discord: 'oidc.discord',
  twitch: 'oidc.twitch',
  tiktok: 'oidc.tiktok',
} as const;
