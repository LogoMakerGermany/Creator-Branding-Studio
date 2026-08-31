/**
 * dotenv populates process.env for local development only.
 * Production secrets are injected by Railway — never assume a .env file exists.
 * All application code reads configuration exclusively via ./config/env.js.
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { initializeFirebase, isFirebaseReady } from './config/firebase.js';
import { assertProductionConfigOrExit } from './config/startup-validation.js';
import { getProductionCspDirectives } from './config/csp.js';
import {
  isDevAuthEnabled,
  isProduction,
  getFrontendUrls,
  getPort,
  isFirebaseAdminConfigured,
  isStripeConfigured,
  hasImageAiProvider,
} from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { attachStaticFrontend, shouldServeStatic } from './middleware/static.js';
import { apiRouter } from './routes/index.js';
import { setHttpServer, setupGracefulShutdown } from './lib/runtime.js';
import { recoverStaleJobs } from './services/job-recovery.service.js';

assertProductionConfigOrExit();
initializeFirebase();

if (isProduction() && !isFirebaseReady()) {
  console.error('[Startup] Firebase Admin failed to initialize — refusing to start');
  process.exit(1);
}

console.log('Server starting...');
const PORT = getPort();
console.log('PORT =', PORT);

const app = express();
const allowedOrigins = getFrontendUrls();

/** Railway reverse proxy — MUST be set before any middleware (helmet, cors, rate-limit, …). */
app.set('trust proxy', 1);

function isReady(): boolean {
  if (!isProduction()) return true;
  return (
    isFirebaseReady() &&
    isFirebaseAdminConfigured() &&
    isStripeConfigured() &&
    hasImageAiProvider()
  );
}

/** Liveness + readiness for Railway. Returns 503 when production config/services are not ready. */
app.get('/health', (_req, res) => {
  if (!isReady()) {
    res.status(503).json({
      status: 'not_ready',
      firebase: isFirebaseReady(),
      stripe: isStripeConfigured(),
      ai: hasImageAiProvider(),
    });
    return;
  }
  res.status(200).json({ status: 'ok' });
});

function createRateLimiters() {
  return {
    webhookLimiter: rateLimit({
      windowMs: 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
    }),
    authLimiter: rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 30,
      skip: () => !isProduction(),
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, error: { code: 'RATE_LIMIT', message: 'Zu viele Anfragen' } },
    }),
    uploadLimiter: rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 40,
      skip: () => !isProduction(),
      standardHeaders: true,
      legacyHeaders: false,
    }),
    apiLimiter: rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 200,
      skip: () => !isProduction(),
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, error: { code: 'RATE_LIMIT', message: 'Zu viele Anfragen' } },
    }),
  };
}

const { webhookLimiter, authLimiter, uploadLimiter, apiLimiter } = createRateLimiters();

app.use(
  helmet({
    contentSecurityPolicy: isProduction()
      ? { directives: getProductionCspDirectives() }
      : false,
    /** Required for Firebase signInWithPopup — default same-origin breaks Google OAuth popups. */
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (isProduction()) {
        // Same-origin requests often omit Origin — allow them.
        if (!origin || allowedOrigins.includes(origin.replace(/\/+$/, ''))) {
          callback(null, true);
          return;
        }
        callback(null, false);
        return;
      }

      if (!origin || allowedOrigins.includes(origin.replace(/\/+$/, ''))) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  })
);

app.use('/api/v1/stripe/webhook', webhookLimiter);
app.use('/api/v1/stripe/webhook', express.raw({ type: 'application/json' }));
app.use('/api/v1/paypal/webhook', webhookLimiter);

app.use('/api/v1/files', uploadLimiter);
app.use('/api/v1/files', express.json({ limit: '7mb' }));

app.use('/api/v1/auth', authLimiter);

app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/v1/stripe/webhook')) {
    next();
    return;
  }
  if (req.originalUrl.startsWith('/api/v1/paypal/webhook')) {
    next();
    return;
  }
  if (req.originalUrl.startsWith('/api/v1/files')) {
    next();
    return;
  }
  if (/\/api\/v1\/video\/[^/]+\/source$/.test(req.originalUrl)) {
    express.json({ limit: '55mb' })(req, res, next);
    return;
  }
  if (req.originalUrl.startsWith('/api/v1/projects/import')) {
    express.json({ limit: '85mb' })(req, res, next);
    return;
  }
  express.json({ limit: '512kb' })(req, res, next);
});

app.use('/api/v1', apiLimiter);

app.use('/api/v1', apiRouter);

attachStaticFrontend(app);

app.use(errorHandler);

console.log('Listening on', PORT);
const server = app.listen(Number(PORT), '0.0.0.0', () => {
  console.log('/health ready');
  const mode = shouldServeStatic() ? 'API + static frontend' : 'API only';
  console.log(`UCBS running (${mode}) on port ${PORT}`);
  if (isDevAuthEnabled()) {
    console.log('[Dev] Dev-Auth aktiv — nur für lokale Entwicklung');
  }
  void recoverStaleJobs().then(
    (r) => {
      if (r.interrupted > 0) {
        console.info('[recovery] stale jobs', r);
      }
    },
    (err) => {
      console.error('[recovery] failed:', err instanceof Error ? err.message : 'error');
    }
  );
});
setHttpServer(server);
setupGracefulShutdown();

export default app;
