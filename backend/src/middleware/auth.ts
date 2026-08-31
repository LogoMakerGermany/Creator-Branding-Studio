import type { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';
import { verifyIdToken } from '../config/firebase.js';
import { getUserById } from '../services/user.service.js';
import type { UserRole } from '@ucbs/shared';

export function denyIfDisabled(profile: { disabled?: boolean } | null | undefined): AppError | null {
  if (profile?.disabled) {
    return new AppError(403, 'ACCOUNT_DISABLED', 'Dieses Konto ist deaktiviert');
  }
  return null;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email: string;
    role: UserRole;
    displayName: string;
    coinBalance: number;
    agencyId?: string;
    teamId?: string;
  };
  /** Decoded Firebase token available before profile exists (registration gate). */
  authToken?: {
    uid: string;
    email: string;
    name?: string;
    emailVerified?: boolean;
  };
}

/**
 * Verifies Bearer token and loads existing profile.
 * Does NOT auto-create users — new accounts must go through /auth/sync with registration gates.
 */
export async function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    next(new AppError(401, 'AUTH_REQUIRED', 'Authentifizierung erforderlich'));
    return;
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const decoded = await verifyIdToken(token);
    req.authToken = {
      uid: decoded.uid,
      email: decoded.email || `${decoded.uid}@unknown.local`,
      name: decoded.name,
      emailVerified: decoded.email_verified,
    };

    const profile = await getUserById(decoded.uid);
    if (!profile) {
      next(
        new AppError(
          403,
          'ACCESS_DENIED',
          'Konto noch nicht freigeschaltet — bitte Registrierung mit Einladungscode abschließen'
        )
      );
      return;
    }

    if (profile.disabled) {
      next(denyIfDisabled(profile)!);
      return;
    }

    req.user = {
      uid: decoded.uid,
      email: profile.email,
      role: profile.role,
      displayName: profile.displayName,
      coinBalance: profile.coinBalance,
    };
    next();
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    next(new AppError(401, 'INVALID_TOKEN', 'Ungültiges Authentifizierungstoken'));
  }
}

/**
 * Verifies token but allows missing profile (for /auth/sync registration).
 */
export async function authenticateAllowUnprovisioned(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    next(new AppError(401, 'AUTH_REQUIRED', 'Authentifizierung erforderlich'));
    return;
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const decoded = await verifyIdToken(token);
    req.authToken = {
      uid: decoded.uid,
      email: decoded.email || `${decoded.uid}@unknown.local`,
      name: decoded.name,
      emailVerified: decoded.email_verified,
    };

    const profile = await getUserById(decoded.uid);
    if (profile) {
      if (profile.disabled) {
        next(denyIfDisabled(profile)!);
        return;
      }
      req.user = {
        uid: decoded.uid,
        email: profile.email,
        role: profile.role,
        displayName: profile.displayName,
        coinBalance: profile.coinBalance,
      };
    }
    next();
  } catch {
    next(new AppError(401, 'INVALID_TOKEN', 'Ungültiges Authentifizierungstoken'));
  }
}

export function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    authenticate(req, _res, next).catch(next);
    return;
  }
  next();
}
