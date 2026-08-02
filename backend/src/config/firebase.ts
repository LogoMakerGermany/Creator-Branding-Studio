import admin from 'firebase-admin';
import {
  isDevAuthEnabled,
  isDevMode,
  isFirebaseAdminConfigured,
  isProduction,
  getFirebaseAdminCredentials,
} from './env.js';

let initialized = false;
let firebaseReady = false;

export function isFirebaseReady(): boolean {
  return firebaseReady;
}

export function initializeFirebase(): void {
  if (initialized) return;

  if (isDevMode()) {
    console.log('[Firebase] Dev-Modus – Firestore deaktiviert, lokaler Store aktiv');
    initialized = true;
    firebaseReady = true;
    return;
  }

  if (!isFirebaseAdminConfigured()) {
    if (isProduction()) {
      console.error(
        '[Firebase] Admin credentials missing in production — FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY required'
      );
      initialized = true;
      firebaseReady = false;
      return;
    }
    console.warn('[Firebase] Credentials fehlen — lokaler Dev-Store aktiv (nur Entwicklung)');
    initialized = true;
    firebaseReady = true;
    return;
  }

  try {
    const creds = getFirebaseAdminCredentials();

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: creds.projectId,
        clientEmail: creds.clientEmail,
        privateKey: creds.privateKey,
      }),
      storageBucket: creds.storageBucket,
      ...(creds.databaseURL ? { databaseURL: creds.databaseURL } : {}),
    });

    initialized = true;
    firebaseReady = true;
    console.log('[Firebase] Admin SDK initialisiert');
  } catch (err) {
    initialized = true;
    firebaseReady = false;
    console.error('[Firebase] Admin SDK initialization failed:', err);
  }
}

export function getFirestore(): admin.firestore.Firestore {
  initializeFirebase();
  if (isDevMode() || !admin.apps.length) {
    throw new Error('Firestore nicht verfügbar – Dev-Modus aktiv');
  }
  return admin.firestore();
}

export function getAuth(): admin.auth.Auth {
  initializeFirebase();
  if (isDevMode() || !admin.apps.length) {
    throw new Error('Firebase Auth nicht verfügbar – Dev-Modus aktiv');
  }
  return admin.auth();
}

export function getStorage(): admin.storage.Storage {
  initializeFirebase();
  if (isDevMode() || !admin.apps.length) {
    throw new Error('Firebase Storage nicht verfügbar – Dev-Modus aktiv');
  }
  return admin.storage();
}

export async function verifyIdToken(token: string): Promise<admin.auth.DecodedIdToken> {
  initializeFirebase();

  if (token.startsWith('dev_')) {
    if (!isDevAuthEnabled()) {
      throw new Error('Dev tokens not allowed');
    }
    const uid = token.replace('dev_', '');
    return {
      uid,
      email: `${uid}@dev.local`,
      aud: 'dev',
      auth_time: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      firebase: { identities: {}, sign_in_provider: 'dev' },
      iat: Math.floor(Date.now() / 1000),
      iss: 'dev',
      sub: uid,
    } as admin.auth.DecodedIdToken;
  }

  if (!admin.apps.length) {
    throw new Error('Authentication service unavailable');
  }

  return getAuth().verifyIdToken(token);
}
