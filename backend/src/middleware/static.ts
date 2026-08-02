import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { shouldServeStatic as configShouldServeStatic } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Path to Vite build output (monorepo root / frontend / dist). */
export function getFrontendDistPath(): string {
  const candidates = [
    path.resolve(__dirname, '../../../frontend/dist'),
    path.resolve(process.cwd(), 'frontend/dist'),
    path.resolve(process.cwd(), '../frontend/dist'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }

  return candidates[0];
}

export function shouldServeStatic(): boolean {
  return configShouldServeStatic();
}

export function attachStaticFrontend(app: Express): void {
  if (!shouldServeStatic()) return;

  const distPath = getFrontendDistPath();

  app.use(express.static(distPath, { index: false, maxAge: '1d' }));

  app.get('/sw.js', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(distPath, 'sw.js'));
  });

  app.get('/manifest.webmanifest', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(distPath, 'manifest.webmanifest'));
  });

  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api') || req.path === '/health') {
      next();
      return;
    }
    res.sendFile(path.join(distPath, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}
