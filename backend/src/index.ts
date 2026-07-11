import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { initializeFirebase } from './config/firebase.js';
import { validateProductionConfig } from './config/startup-validation.js';
import { getProductionCspDirectives } from './config/csp.js';
import { isDevAuthEnabled, isProduction, getFrontendUrls } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { attachStaticFrontend, shouldServeStatic } from './middleware/static.js';
import { apiRouter } from './routes/index.js';

console.log('Server starting...');
console.log('PORT =', process.env.PORT);

const app = express();
const PORT = process.env.PORT || 8080;
const allowedOrigins = getFrontendUrls();

/** Railway reverse proxy — MUST be set before any middleware (helmet, cors, rate-limit, …). */
app.set('trust proxy', 1);

/** Health probe — registered before any other middleware so Railway gets 200 immediately. */
app.get('/health', (_req, res) => {
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
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, error: { code: 'RATE_LIMIT', message: 'Zu viele Anfragen' } },
    }),
    uploadLimiter: rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 40,
      standardHeaders: true,
      legacyHeaders: false,
    }),
    apiLimiter: rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 200,
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
  express.json({ limit: '512kb' })(req, res, next);
});

app.use('/api/v1', apiLimiter);

app.use('/api/v1', apiRouter);

attachStaticFrontend(app);

app.use(errorHandler);

console.log('Listening on', PORT);
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log('/health ready');
  const mode = shouldServeStatic() ? 'API + static frontend' : 'API only';
  console.log(`UCBS running (${mode}) on port ${PORT}`);
  if (isDevAuthEnabled()) {
    console.log('[Dev] Dev-Auth aktiv — nur für lokale Entwicklung');
  }

  setImmediate(() => {
    try {
      validateProductionConfig();
    } catch (err) {
      console.error('[Startup] Config validation failed:', err);
    }

    try {
      initializeFirebase();
    } catch (err) {
      console.error('[Startup] Firebase initialization failed:', err);
    }
  });
});

export default app;
