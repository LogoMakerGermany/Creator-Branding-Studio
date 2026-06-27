import type { Response, NextFunction } from 'express';
import { Permission, ROLE_PERMISSIONS, UserRole } from '@ucbs/shared';
import type { AuthenticatedRequest } from './auth.js';
import { AppError } from './errorHandler.js';

export function requirePermission(...permissions: Permission[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentifizierung erforderlich');
    }

    const role = req.user.role as UserRole;
    const userPermissions = ROLE_PERMISSIONS[role] ?? [];

    const hasPermission = permissions.every((p) => userPermissions.includes(p));
    if (!hasPermission) {
      throw new AppError(403, 'FORBIDDEN', 'Keine Berechtigung für diese Aktion');
    }

    next();
  };
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentifizierung erforderlich');
    }

    if (!roles.includes(req.user.role as UserRole)) {
      throw new AppError(403, 'FORBIDDEN', 'Keine Berechtigung für diese Aktion');
    }

    next();
  };
}
