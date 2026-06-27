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

validateProductionConfig();
initializeFirebase();

const app = express();
const PORT = process.env.PORT || 3001;
const allowedOrigins = getFrontendUrls();

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: isProduction()
      ? { directives: getProductionCspDirectives() }
      : false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (isProduction()) {
        if (origin && allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
        return;
      }

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  })
);

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Zu viele Anfragen' } },
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Zu viele Anfragen' } },
});

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

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/v1', apiRouter);

attachStaticFrontend(app);

app.use(errorHandler);

app.listen(PORT, () => {
  const mode = shouldServeStatic() ? 'API + static frontend' : 'API only';
  console.log(`UCBS running (${mode}) on port ${PORT}`);
  if (isDevAuthEnabled()) {
    console.log('[Dev] Dev-Auth aktiv — nur für lokale Entwicklung');
  }
});

export default app;
