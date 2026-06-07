import express, { type Request, type Response, type RequestHandler } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import { applySecurity, csrfProtection } from './middleware/security.js';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import { generateRouter } from './routes/generate.js';
import { paymentsRouter } from './routes/payments.js';
import { testRouter } from './routes/test.js';
import { adminRouter } from './routes/admin.js';
import { getDb } from './db/localDb.js';
import { env } from './config.js';
import { validateEnvOnStartup } from './validateEnv.js';
import { handleStripeWebhook } from './services/paymentService.js';

const app = express();
app.set('trust proxy', 1);
console.log('[startup] trust proxy =', app.get('trust proxy'));
app.post(
  '/api/payments/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    try {
      const payload = req.body as Buffer;
      await handleStripeWebhook(payload, req.headers['stripe-signature'] as string | undefined);
      res.json({ received: true });
    } catch (err) {
      console.error('Stripe webhook error:', err);
      res.status(400).json({ error: err instanceof Error ? err.message : 'Webhook fehlgeschlagen' });
    }
  },
);

app.use(express.json({ limit: '1mb' }));
applySecurity(app);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    environment: env.nodeEnv,
    authProvider: env.authProvider,
    dbProvider: env.dbProvider,
    capabilities: {
      aiImages: Boolean(env.openaiApiKey || env.replicateApiToken),
      aiVideo: Boolean(env.runwayApiKey || env.replicateApiToken),
      stripe: Boolean(env.stripeSecretKey),
      firebaseAdmin: Boolean(env.firebaseProjectId && env.firebaseClientEmail && env.firebasePrivateKey),
    },
  });
});

const csrf = csrfProtection() as unknown as RequestHandler;

app.get('/api/auth/csrf-token', csrf, (req: Request, res: Response) => {
  const token = (req as Request & { csrfToken?: () => string }).csrfToken?.();
  res.json({ csrfToken: token });
});

app.use('/api/auth', authRouter);
app.use('/api/projects', csrf, projectsRouter);
app.use('/api/projects', csrf, generateRouter);
app.use('/api/payments', csrf, paymentsRouter);
app.use('/api/test', csrf, testRouter);
app.use('/api/admin', csrf, adminRouter);

if (env.isProduction) {
  console.log('webDistDir =', env.webDistDir);
  console.log('webDistExists =', existsSync(env.webDistDir));
  console.log('cwd =', process.cwd());

  if (existsSync(env.webDistDir)) {
    app.use(express.static(env.webDistDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(join(env.webDistDir, 'index.html'));
    });
  } else {
    console.warn('[static] web dist missing – frontend will not be served from API');
  }
}

app.use((err: Error & { code?: string }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ error: 'Ungültiges CSRF-Token' });
  }
  next(err);
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Interner Serverfehler' });
});

async function start() {
  validateEnvOnStartup();
  await getDb();
  app.listen(env.port, () => {
    console.log(`Creator Branding Studio API → http://localhost:${env.port}`);
  });
}

start();
