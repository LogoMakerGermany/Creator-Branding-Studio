import type { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';
import { verifyIdToken } from '../config/firebase.js';
import { getUserById, getOrCreateUser } from '../services/user.service.js';
import type { UserRole } from '@ucbs/shared';

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
}

export async function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    next(new AppError(401, 'UNAUTHORIZED', 'Authentifizierung erforderlich'));
    return;
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const decoded = await verifyIdToken(token);
    let profile = await getUserById(decoded.uid);

    if (!profile) {
      profile = await getOrCreateUser(
        decoded.uid,
        decoded.email || `${decoded.uid}@unknown.local`,
        decoded.name
      );
    }

    req.user = {
      uid: decoded.uid,
      email: profile.email,
      role: profile.role,
      displayName: profile.displayName,
      coinBalance: profile.coinBalance,
    };
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
