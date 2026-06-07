import type { User } from '@cbs/shared';
import { DEFAULT_USER_COINS } from '@cbs/shared';
import { getDb } from '../db/localDb.js';
import { env } from '../config.js';
import {
  signToken,
  setAuthCookie,
  sanitizeUser,
  isFirebaseAdminConfigured,
  type AuthRequest,
} from './session.js';
import type { Response } from 'express';

let adminApp: import('firebase-admin/app').App | null = null;

export function assertFirebaseConfigured(): void {
  if (!isFirebaseAdminConfigured()) {
    throw new Error(
      'Firebase Auth ist nicht konfiguriert. Setze FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL und FIREBASE_PRIVATE_KEY.',
    );
  }
}

async function getFirebaseAdmin() {
  assertFirebaseConfigured();
  if (adminApp) return adminApp;

  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  if (getApps().length > 0) {
    adminApp = getApps()[0]!;
    return adminApp;
  }

  adminApp = initializeApp({
    credential: cert({
      projectId: env.firebaseProjectId,
      clientEmail: env.firebaseClientEmail,
      privateKey: env.firebasePrivateKey,
    }),
  });
  return adminApp;
}

function resolveRole(email?: string): User['role'] {
  if (email && env.adminEmail && email.toLowerCase() === env.adminEmail.toLowerCase()) {
    return 'admin';
  }
  return 'user';
}

async function syncUserToFirestore(user: User, firebaseUid: string): Promise<void> {
  await getFirebaseAdmin();
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  const firestore = getFirestore();
  await firestore.collection('users').doc(firebaseUid).set({
    appUserId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    coins: user.coins ?? DEFAULT_USER_COINS,
    banned: user.banned,
    createdAt: user.createdAt,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function findOrCreateFirebaseUser(decoded: {
  uid: string;
  email?: string;
  name?: string;
}): Promise<User> {
  const db = await getDb();
  const users = await db.listUsers();
  let user = users.find(u => u.firebaseUid === decoded.uid) || null;

  if (!user && decoded.email) {
    user = await db.getUserByEmail(decoded.email);
    if (user) {
      await db.updateUser(user.id, { firebaseUid: decoded.uid });
      user = { ...user, firebaseUid: decoded.uid };
    }
  }

  if (!user) {
    if (!decoded.email) {
      throw new Error('Firebase-Konto ohne E-Mail – bitte E-Mail in Firebase Auth aktivieren.');
    }
    user = await db.createUser({
      id: crypto.randomUUID(),
      email: decoded.email,
      name: decoded.name || decoded.email.split('@')[0] || 'Benutzer',
      role: resolveRole(decoded.email),
      banned: false,
      coins: DEFAULT_USER_COINS,
      firebaseUid: decoded.uid,
      createdAt: new Date().toISOString(),
    });
  }

  if (user.banned) {
    throw new Error('Benutzer gesperrt');
  }

  await syncUserToFirestore(user, decoded.uid);
  return user;
}

export async function authenticateFirebaseToken(
  idToken: string,
  res: Response,
): Promise<{ user: ReturnType<typeof sanitizeUser> }> {
  await getFirebaseAdmin();
  const { getAuth } = await import('firebase-admin/auth');
  const decoded = await getAuth().verifyIdToken(idToken);
  const user = await findOrCreateFirebaseUser({
    uid: decoded.uid,
    email: decoded.email,
    name: decoded.name,
  });
  const token = signToken(user);
  setAuthCookie(res, token);
  return { user: sanitizeUser(user) };
}

export type { AuthRequest };
