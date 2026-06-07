import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import type { User, UserRole } from '@cbs/shared';
import { env, requireJwtSecret } from '../config.js';
import { getDb } from '../db/localDb.js';

export interface AuthRequest extends Request {
  user?: User;
}

const COOKIE_NAME = 'cbs_token';

export function sanitizeUser(user: User) {
  const { passwordHash: _passwordHash, firebaseUid: _firebaseUid, ...safe } = user;
  return safe;
}

export function signToken(user: User): string {
  return jwt.sign({ sub: user.id, role: user.role }, requireJwtSecret(), { expiresIn: '7d' });
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME);
}

export async function authMiddleware(req: AuthRequest, res: Response, next: () => void): Promise<void> {
  const token = req.cookies?.[COOKIE_NAME] || req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Nicht authentifiziert' });
    return;
  }
  try {
    const payload = jwt.verify(token, requireJwtSecret()) as { sub: string };
    const db = await getDb();
    const user = await db.getUserById(payload.sub);
    if (!user || user.banned) {
      res.status(401).json({ error: 'Benutzer nicht gefunden oder gesperrt' });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Ungültiges Token' });
  }
}

export function optionalAuth(req: AuthRequest, _res: Response, next: () => void): void {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) { next(); return; }
  try {
    const payload = jwt.verify(token, requireJwtSecret()) as { sub: string };
    getDb().then(db => db.getUserById(payload.sub)).then(user => {
      if (user && !user.banned) req.user = user;
      next();
    }).catch(() => next());
  } catch {
    next();
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: () => void): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Nicht authentifiziert' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Keine Berechtigung' });
      return;
    }
    next();
  };
}

export function isFirebaseAdminConfigured(): boolean {
  return Boolean(env.firebaseProjectId && env.firebaseClientEmail && env.firebasePrivateKey);
}
