export {
  authMiddleware,
  optionalAuth,
  requireRole,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  sanitizeUser,
  isFirebaseAdminConfigured,
} from './session.js';
export type { AuthRequest } from './session.js';
export { authenticateFirebaseToken, assertFirebaseConfigured } from './firebaseAuth.js';
