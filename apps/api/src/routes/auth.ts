import { Router } from 'express';
import {
  login, register, resetPassword, signToken, setAuthCookie, clearAuthCookie,
  authMiddleware, requireRole, sanitizeUser, authenticateFirebaseToken, type AuthRequest,
} from '../auth/index.js';
import { getDb } from '../db/localDb.js';
import { audit } from '../guards/fraudShield.js';
import { env } from '../config.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await login(email, password);
    if (!user) return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    const token = signToken(user);
    setAuthCookie(res, token);
    await audit(await getDb(), user.id, 'login', 'auth', email, req.ip);
    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Fehler' });
  }
});

authRouter.post('/register', async (req, res) => {
  try {
    const { email, name, password } = req.body;
    const user = await register(email, name, password);
    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Fehler' });
  }
});

authRouter.post('/firebase', async (req, res) => {
  try {
    if (env.authProvider !== 'firebase') {
      return res.status(400).json({ error: 'Firebase Auth ist nicht aktiv.' });
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

authRouter.post('/reset-password', async (req, res) => {
  await resetPassword(req.body.email);
  res.json({ message: 'Falls ein Konto existiert, wurde ein Reset-Link gesendet.' });
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
