import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@ucbs/shared';
import { ZodError } from 'zod';
import { ServiceError } from '../lib/errors.js';
import { isProduction } from '../config/env.js';
import { logEvent, safeErrorDetails, sanitizeProviderError } from '../lib/observability.js';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }

  override toString(): string {
    return `${this.name} [${this.code}]: ${this.message}`;
  }
}

function requestIdOf(req: Request): string | undefined {
  return req.requestId;
}

function sendApiError(
  req: Request,
  res: Response<ApiResponse>,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
): void {
  const requestId = requestIdOf(req);
  const safe = safeErrorDetails(details);
  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(safe ? { details: safe } : {}),
      ...(requestId ? { requestId } : {}),
    },
  });
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response<ApiResponse>,
  _next: NextFunction
): void {
  const requestId = requestIdOf(req);

  if (err instanceof AppError) {
    sendApiError(req, res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  if (err instanceof ServiceError) {
    sendApiError(req, res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  if (err instanceof ZodError) {
    sendApiError(req, res, 400, 'VALIDATION_ERROR', 'Ungültige Anfrage');
    return;
  }

  logEvent({
    level: 'error',
    ts: new Date().toISOString(),
    event: 'unhandled_error',
    requestId,
    method: req.method,
    route: (req.originalUrl || '').split('?')[0],
    status: 500,
    code: 'INTERNAL_ERROR',
    message: isProduction() ? err.name : sanitizeProviderError(err),
  });
  sendApiError(req, res, 500, 'INTERNAL_ERROR', 'Ein interner Fehler ist aufgetreten');
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function sendSuccess<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}
