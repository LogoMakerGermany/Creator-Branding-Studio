import { shouldServeStatic } from '../middleware/static.js';

export interface PublicClientConfig {
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  } | null;
  stripePublishableKey: string | null;
}

function readPublicFirebase() {
  const apiKey = process.env.PUBLIC_FIREBASE_API_KEY?.trim();
  const projectId = process.env.PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (!apiKey || !projectId) return null;

  return {
    apiKey,
    authDomain: process.env.PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket:
      process.env.PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || `${projectId}.appspot.com`,
    messagingSenderId: process.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() || '',
    appId: process.env.PUBLIC_FIREBASE_APP_ID?.trim() || '',
  };
}

export function getPublicClientConfig(): PublicClientConfig {
  return {
    firebase: readPublicFirebase(),
    stripePublishableKey: process.env.PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || null,
  };
}

export function isPublicClientConfigReady(): boolean {
  return Boolean(getPublicClientConfig().firebase?.apiKey);
}

/** All-in-one Docker deploy needs runtime PUBLIC_FIREBASE_* (Vite env is not available at image build). */
export function requiresPublicClientConfig(): boolean {
  return shouldServeStatic();
}
