import { Router } from 'express';
import { sendSuccess } from '../middleware/errorHandler.js';

const DRAFT_NOTICE = 'Entwurf / vor Veröffentlichung rechtlich prüfen lassen';

export const legalRoutes = Router();

legalRoutes.get('/impressum', (_req, res) => {
  sendSuccess(res, {
    title: 'Impressum',
    draft: true,
    notice: DRAFT_NOTICE,
    html: 'Angaben gemäß § 5 TMG. Betreiber, Anschrift und Kontakt vor Veröffentlichung durch den Betreiber ergänzen.',
  });
});

legalRoutes.get('/datenschutz', (_req, res) => {
  sendSuccess(res, {
    title: 'Datenschutzerklärung',
    draft: true,
    notice: DRAFT_NOTICE,
    html: 'Technischer Entwurf: Die App verarbeitet Kontodaten und Creator-Inhalte zur Leistungserbringung. Firebase Auth, localStorage (z. B. auth_token) und sessionStorage (z. B. Invite) werden genutzt. Keine Marketing-Cookies im aktuellen Stand. KI-Anbieter können Prompts/Medien verarbeiten. Keine Aussage zur Rechtskonformität.',
  });
});

legalRoutes.get('/agb', (_req, res) => {
  sendSuccess(res, {
    title: 'AGB',
    draft: true,
    notice: DRAFT_NOTICE,
    html: 'Technischer Entwurf: Coins sind Verbrauchsguthaben der App. Fehlgeschlagene technische Generierungen sollen erstattet werden. Uploads dienen der Leistungserbringung. Keine rechtsgültigen Nutzungsbedingungen.',
  });
});

legalRoutes.get('/widerruf', (_req, res) => {
  sendSuccess(res, {
    title: 'Widerruf',
    draft: true,
    notice: DRAFT_NOTICE,
    html: 'Platzhalter. Ein Widerrufstext wird vom Betreiber bereitgestellt, sobald er juristisch vorliegt.',
  });
});

legalRoutes.get('/cookies', (_req, res) => {
  sendSuccess(res, {
    title: 'Speicher & Cookies',
    draft: true,
    notice: DRAFT_NOTICE,
    html: 'Kein Marketing-Cookie-Banner, weil aktuell keine Marketing-/Analytics-Cookies gesetzt werden. Technisch genutzt: localStorage (auth_token, UI-Präferenzen), sessionStorage (Invite/Auth-Fehler), Firebase Auth. Das ist keine Erklärung „wir verwenden keine Cookies“.',
  });
});
