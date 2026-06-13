import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import csurf from 'csurf';
import type { Express } from 'express';
import { env } from '../config.js';

function isBehindProxy(): boolean {
  return env.isProduction
    || Boolean(process.env.RAILWAY_ENVIRONMENT_NAME)
    || Boolean(process.env.RAILWAY_SERVICE_NAME);
}

export function applySecurity(app: Express): void {
  if (isBehindProxy()) {
    app.set('trust proxy', 1);
  }

  app.use(helmet({
    contentSecurityPolicy: env.nodeEnv === 'development' ? false : {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
      },
    },
  }));

  app.use(cors({
    origin: env.corsOrigin,
    credentials: true,
  }));

  app.use(cookieParser());

  if (env.rateLimitEnabled) {
    const rateLimitOptions = {
      validate: { xForwardedForHeader: false as const },
    };

    const isHealthCheck = (path: string) => path === '/health' || path === '/api/health';

    app.use(rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      message: { error: 'Zu viele Anfragen. Bitte später erneut versuchen.' },
      skip: (req) => isHealthCheck(req.path),
      ...rateLimitOptions,
    }));

    const generateLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 20,
      message: { error: 'Generierungslimit erreicht. Bitte warten.' },
      ...rateLimitOptions,
    });
    app.use('/api/projects/:id/generate', generateLimiter);
    app.use('/api/projects/:id/stream-pack', generateLimiter);
    app.use('/api/projects/:id/stickers', generateLimiter);
    app.use('/api/projects/:id/animations', generateLimiter);
  }
}

export function csrfProtection() {
  return csurf({ cookie: { httpOnly: true, sameSite: 'lax', secure: env.isProduction } });
}

export function sanitizeInput(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim().slice(0, 2000);
}
