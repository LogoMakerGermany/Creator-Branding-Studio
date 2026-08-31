import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@ucbs/shared';
import { ZodError } from 'zod';
import { ServiceError } from '../lib/errors.js';
import { isProduction } from '../config/env.js';

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

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response<ApiResponse>,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  if (err instanceof ServiceError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Ungültige Anfrage',
      },
    });
    return;
  }

  if (isProduction()) {
    console.error('Unhandled error:', err.name, err.message);
  } else {
    console.error('Unhandled error:', err);
  }
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Ein interner Fehler ist aufgetreten',
    },
  });
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
