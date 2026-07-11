import { getFrontendUrls } from './env.js';

/** Always allow known production hosts even if FRONTEND_URLS on Railway is stale. */
const KNOWN_PRODUCTION_ORIGINS = [
  'https://creatorbrandingstudioultimate-production.up.railway.app',
  'https://creatorstudio-519eb.web.app',
  'https://creatorstudio-519eb.firebaseapp.com',
];

/** CSP for all-in-one production (API serves static SPA). */
export function getProductionCspDirectives() {
  const origins = [...new Set([...getFrontendUrls(), ...KNOWN_PRODUCTION_ORIGINS])];

  return {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      'https://apis.google.com',
      'https://accounts.google.com',
      'https://www.gstatic.com',
      'https://*.gstatic.com',
    ],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://accounts.google.com'],
    imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
    connectSrc: [
      "'self'",
      ...origins,
      'https://*.googleapis.com',
      'https://firebase.googleapis.com',
      'https://*.firebaseio.com',
      'wss://*.firebaseio.com',
      'https://identitytoolkit.googleapis.com',
      'https://securetoken.googleapis.com',
      'https://firestore.googleapis.com',
      'https://firebasestorage.googleapis.com',
      'https://www.googleapis.com',
    ],
    fontSrc: ["'self'", 'https:', 'data:', 'https://fonts.gstatic.com', 'https://*.gstatic.com'],
    objectSrc: ["'none'"],
    frameSrc: [
      "'self'",
      'https://accounts.google.com',
      'https://*.firebaseapp.com',
      'https://*.google.com',
    ],
    frameAncestors: ["'none'"],
    workerSrc: ["'self'"],
    manifestSrc: ["'self'"],
  };
}
