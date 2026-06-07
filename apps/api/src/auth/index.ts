import { env } from '../config.js';
import * as mockAuth from './mockAuth.js';
import * as firebaseAuth from './firebaseAuth.js';

const provider = env.authProvider === 'firebase' ? firebaseAuth : mockAuth;

export const login = provider.login;
export const register = provider.register;
export const resetPassword = provider.resetPassword;

export {
  authMiddleware,
  optionalAuth,
  requireRole,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  sanitizeUser,
  ensureDemoPasswordHashes,
} from './mockAuth.js';
export type { AuthRequest } from './mockAuth.js';

export { authenticateFirebaseToken } from './firebaseAuth.js';
