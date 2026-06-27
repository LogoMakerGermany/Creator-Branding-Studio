import { getFrontendUrls } from './env.js';

/** CSP for all-in-one production (API serves static SPA). */
export function getProductionCspDirectives() {
  const origins = getFrontendUrls();

  return {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
    connectSrc: [
      "'self'",
      ...origins,
      'https://*.googleapis.com',
      'https://*.firebaseio.com',
      'wss://*.firebaseio.com',
      'https://identitytoolkit.googleapis.com',
      'https://securetoken.googleapis.com',
      'https://firestore.googleapis.com',
      'https://firebasestorage.googleapis.com',
    ],
    fontSrc: ["'self'", 'https:', 'data:', 'https://fonts.gstatic.com'],
    objectSrc: ["'none'"],
    frameSrc: ["'self'", 'https://accounts.google.com', 'https://*.firebaseapp.com'],
    frameAncestors: ["'none'"],
    workerSrc: ["'self'"],
    manifestSrc: ["'self'"],
  };
}
