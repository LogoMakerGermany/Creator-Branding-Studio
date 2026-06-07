import { Router } from 'express';
import { authMiddleware, type AuthRequest } from './auth.js';
import { isTestModeUser } from '../services/coinService.js';
import { env } from '../config.js';

export const testRouter = Router();
testRouter.use(authMiddleware as never);

testRouter.get('/status', (req: AuthRequest, res) => {
  const active = isTestModeUser(req.user);
  res.json({
    active,
    globalTestMode: env.testMode,
    platforms: ['twitch', 'tiktok', 'kick', 'youtube'],
    message: active
      ? 'Testmodus aktiv – Mock-Assets ohne API-Kosten für Plattform-Tester.'
      : 'Testmodus nur für Tester oder wenn TEST_MODE=true gesetzt ist.',
  });
});
