import { Router } from 'express';
import {
  authMiddleware,
  requireRole,
  sanitizeUser,
  authenticateFirebaseToken,
  clearAuthCookie,
  isFirebaseAdminConfigured,
  type AuthRequest,
} from '../auth/index.js';
import { getDb } from '../db/localDb.js';
import { audit } from '../guards/fraudShield.js';
import { env } from '../config.js';

export const authRouter = Router();

authRouter.get('/status', (_req, res) => {
  const firebaseConfigured = isFirebaseAdminConfigured();
  res.json({
    authProvider: env.authProvider,
    firebaseConfigured,
    ready: env.authProvider === 'firebase' && firebaseConfigured,
    message: firebaseConfigured
      ? undefined
      : 'Firebase Auth ist nicht konfiguriert. Bitte FIREBASE_* Variablen setzen.',
  });
});

authRouter.post('/firebase', async (req, res) => {
  try {
    if (env.authProvider !== 'firebase') {
      return res.status(503).json({ error: 'Nur Firebase Auth ist aktiv. Setze AUTH_PROVIDER=firebase.' });
    }
    if (!isFirebaseAdminConfigured()) {
      return res.status(503).json({
        error: 'Firebase Auth ist nicht konfiguriert. Kein Fallback verfügbar.',
      });
    }
    const { idToken } = req.body;
    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({ error: 'idToken erforderlich' });
    }
    const result = await authenticateFirebaseToken(idToken, res);
    await audit(await getDb(), result.user.id, 'login', 'firebase', result.user.email, req.ip);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : 'Firebase Auth fehlgeschlagen' });
  }
});

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', authMiddleware as never, (req: AuthRequest, res) => {
  res.json({
    user: req.user ? sanitizeUser(req.user) : null,
  });
});

authRouter.get('/csrf-token', (_req, res, next) => {
  next();
});

export { authMiddleware, requireRole, type AuthRequest };
