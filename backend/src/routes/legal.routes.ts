import { Router, type Response } from 'express';
import { AppError, sendSuccess } from '../middleware/errorHandler.js';
import { getLegalPage } from '../services/legal.service.js';

const DRAFT_NOTICE = 'Entwurf / vor Veröffentlichung rechtlich prüfen lassen';

export const legalRoutes = Router();

function sendLegalPage(slug: string, res: Response) {
  const page = getLegalPage(slug);
  if (!page) {
    throw new AppError(404, 'NOT_FOUND', 'Seite nicht gefunden');
  }
  sendSuccess(res, {
    ...page,
    draft: true,
    notice: DRAFT_NOTICE,
  });
}

legalRoutes.get('/impressum', (_req, res) => {
  sendLegalPage('impressum', res);
});

legalRoutes.get('/datenschutz', (_req, res) => {
  sendLegalPage('datenschutz', res);
});

legalRoutes.get('/agb', (_req, res) => {
  sendLegalPage('agb', res);
});

legalRoutes.get('/widerruf', (_req, res) => {
  sendLegalPage('widerruf', res);
});

legalRoutes.get('/cookies', (_req, res) => {
  sendLegalPage('cookies', res);
});
