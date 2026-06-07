import { Router } from 'express';
import { authMiddleware, type AuthRequest } from './auth.js';
import {
  listPackages,
  createStripeCheckout,
  createPayPalCheckout,
  listUserPayments,
} from '../services/paymentService.js';
import { getUserCoins, creditCoins } from '../services/coinService.js';
import { getDb } from '../db/localDb.js';
import { requireRole } from '../auth/index.js';
import { env } from '../config.js';

export const paymentsRouter = Router();

paymentsRouter.get('/packages', (_req, res) => {
  res.json(listPackages());
});

paymentsRouter.use(authMiddleware as never);

paymentsRouter.get('/coins/balance', async (req: AuthRequest, res) => {
  const balance = await getUserCoins(req.user!.id);
  res.json({
    coins: balance,
    testMode: env.testMode || req.user!.role === 'tester' || req.user!.isTester,
  });
});

paymentsRouter.get('/coins/transactions', async (req: AuthRequest, res) => {
  const db = await getDb();
  res.json(await db.listCoinTransactions(req.user!.id, 50));
});

paymentsRouter.post('/stripe/checkout', async (req: AuthRequest, res) => {
  try {
    const result = await createStripeCheckout(req.user!.id, req.body.packageId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Fehler' });
  }
});

paymentsRouter.post('/paypal/checkout', async (req: AuthRequest, res) => {
  try {
    const result = await createPayPalCheckout(req.user!.id, req.body.packageId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Fehler' });
  }
});

paymentsRouter.get('/history', async (req: AuthRequest, res) => {
  res.json(await listUserPayments(req.user!.id));
});

paymentsRouter.post('/admin/coins/grant', requireRole('admin') as never, async (req: AuthRequest, res) => {
  try {
    const { userId, amount } = req.body;
    const balance = await creditCoins(userId, amount, `Admin-Gutschrift von ${req.user!.name}`);
    res.json({ balance });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Fehler' });
  }
});

paymentsRouter.get('/admin/all', requireRole('admin', 'moderator') as never, async (_req, res) => {
  const db = await getDb();
  res.json({
    payments: await db.listPayments(100),
    transactions: await db.listCoinTransactions(undefined, 100),
  });
});
