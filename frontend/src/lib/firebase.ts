import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type Auth,
  type User,
} from 'firebase/auth';
import { getFirebaseClientConfig, isFirebaseConfigured } from './runtime-config';

export { isFirebaseConfigured };

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
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  if (!auth) {
    auth = getAuth(app);
  }
  return auth;
}

export async function loginWithGoogle(): Promise<User> {
  const a = getFirebaseAuth();
  if (!a) throw new Error('Firebase nicht konfiguriert');
  const result = await signInWithPopup(a, new GoogleAuthProvider());
  return result.user;
}

export async function loginWithOAuth(providerId: string): Promise<User> {
  const a = getFirebaseAuth();
  if (!a) throw new Error('Firebase nicht konfiguriert');
  const provider = new OAuthProvider(providerId);
  const result = await signInWithPopup(a, provider);
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
  return result.user;
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
