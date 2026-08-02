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
  onAuthStateChanged,
  type Auth,
  type User,
  type AuthProvider,
} from 'firebase/auth';
import { getFirebaseClientConfig, isFirebaseConfigured } from './runtime-config';
import type { AuthProviderId } from './auth-providers';

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

export async function registerWithEmail(email: string, password: string): Promise<User> {
  const a = getFirebaseAuth();
  if (!a) throw new Error('Firebase nicht konfiguriert');
  const result = await createUserWithEmailAndPassword(a, email, password);
  try {
    await sendEmailVerification(result.user);
  } catch (err) {
    console.warn('[Auth] E-Mail-Verifizierung konnte nicht gesendet werden:', err);
  }
  return result.user;
}

export async function resetPassword(email: string): Promise<void> {
  const a = getFirebaseAuth();
  if (!a) throw new Error('Firebase nicht konfiguriert');
  await sendPasswordResetEmail(a, email);
}

export async function resendEmailVerification(): Promise<void> {
  const a = getFirebaseAuth();
  if (!a?.currentUser) throw new Error('Nicht angemeldet');
  await sendEmailVerification(a.currentUser);
}

export async function logoutFirebase(): Promise<void> {
  const a = getFirebaseAuth();
  if (a) await signOut(a);
}

export function subscribeToAuth(callback: (user: User | null) => void): () => void {
  const a = getFirebaseAuth();
  if (!a) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(a, callback);
}

export async function getIdToken(): Promise<string | null> {
  const a = getFirebaseAuth();
  if (!a?.currentUser) return localStorage.getItem('auth_token');
  return a.currentUser.getIdToken();
}

export const OAUTH_PROVIDERS = {
  discord: 'oidc.discord',
  twitch: 'oidc.twitch',
  tiktok: 'oidc.tiktok',
} as const;
