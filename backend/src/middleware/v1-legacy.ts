import type { Response, NextFunction } from 'express';
import { UserRole } from '@ucbs/shared';
import type { AuthenticatedRequest } from './auth.js';
import { AppError } from './errorHandler.js';

/** V1: later surfaces stay mounted but are not usable by Creator/Tester. */
export function blockLegacyV1(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const role = req.user?.role as UserRole | undefined;
  if (role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN) {
    next();
    return;
  }
  throw new AppError(403, 'FEATURE_NOT_AVAILABLE', 'Diese Funktion ist in NEXTER V1 nicht verfügbar');
}
