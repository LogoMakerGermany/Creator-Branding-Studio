import admin from 'firebase-admin';
import { isDevAuthEnabled, isDevMode, isFirebaseAdminConfigured, isProduction } from './env.js';

let initialized = false;

export function initializeFirebase(): void {
  if (initialized) return;

  if (isDevMode()) {
    console.log('[Firebase] Dev-Modus – Firestore deaktiviert, lokaler Store aktiv');
    initialized = true;
    return;
  }

  if (!isFirebaseAdminConfigured()) {
    if (isProduction()) {
      console.error('[Firebase] Admin credentials missing in production — auth/storage APIs unavailable until configured');
      initialized = true;
      return;
    }
    console.warn('[Firebase] Credentials fehlen — lokaler Dev-Store aktiv (nur Entwicklung)');
    initialized = true;
    return;
  }

  try {
    const projectId = process.env.FIREBASE_PROJECT_ID!;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });

    initialized = true;
    console.log('[Firebase] Admin SDK initialisiert');
  } catch (err) {
    initialized = true;
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

  if (isDevAuthEnabled() && (isDevMode() || !admin.apps.length)) {
    if (token.startsWith('dev_')) {
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
    throw new Error('Invalid dev token');
  }

  if (!admin.apps.length) {
    throw new Error('Authentication service unavailable');
  }

  return getAuth().verifyIdToken(token);
}
