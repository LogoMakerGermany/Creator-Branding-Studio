import type { Request, Response, NextFunction } from 'express';
import {
  isSlowRequest,
  logEvent,
  resolveRequestId,
  shouldSkipRequestLog,
} from '../lib/observability.js';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id') ?? req.header('x-correlation-id');
  const requestId = resolveRequestId(incoming);
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  const started = Date.now();
  res.on('finish', () => {
    const route = req.originalUrl || req.url || '';
    if (shouldSkipRequestLog(route.split('?')[0] || '')) return;
    const durationMs = Date.now() - started;
    const status = res.statusCode;
    const slow = isSlowRequest(durationMs);
    if (status < 400 && !slow) return;
    logEvent({
      level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'warn',
      ts: new Date().toISOString(),
      event: slow && status < 400 ? 'http_slow' : 'http_request',
      requestId,
      method: req.method,
      route,
      status,
      durationMs,
    });
  });
  next();
}
