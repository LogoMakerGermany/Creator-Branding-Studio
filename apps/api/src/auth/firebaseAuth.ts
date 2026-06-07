import type { User } from '@cbs/shared';
import { DEFAULT_USER_COINS } from '@cbs/shared';
import { getDb } from '../db/localDb.js';
import { env } from '../config.js';
import { signToken, setAuthCookie, sanitizeUser, type AuthRequest } from './mockAuth.js';
import type { Response } from 'express';

let adminApp: import('firebase-admin/app').App | null = null;

async function getFirebaseAdmin() {
  if (adminApp) return adminApp;

  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  if (getApps().length > 0) {
    adminApp = getApps()[0]!;
    return adminApp;
  }

  if (!env.firebaseProjectId || !env.firebaseClientEmail || !env.firebasePrivateKey) {
    throw new Error('Firebase Admin SDK nicht konfiguriert.');
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
    }
  }

  if (!user) {
    user = await db.createUser({
      id: crypto.randomUUID(),
      email: decoded.email || `${decoded.uid}@firebase.local`,
      name: decoded.name || decoded.email?.split('@')[0] || 'Benutzer',
      role: 'user',
      banned: false,
      coins: DEFAULT_USER_COINS,
      firebaseUid: decoded.uid,
      createdAt: new Date().toISOString(),
    });
  }

  if (user.banned) {
    throw new Error('Benutzer gesperrt');
  }

  return user;
}

export async function login(_email: string, _password: string): Promise<User | null> {
  throw new Error('Nutze POST /api/auth/firebase mit Firebase ID Token.');
}

export async function register(_email: string, _name: string, _password: string): Promise<User> {
  throw new Error('Nutze Firebase Auth zur Registrierung.');
}

export async function resetPassword(_email: string): Promise<void> {
  throw new Error('Passwort-Reset über Firebase Auth.');
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
