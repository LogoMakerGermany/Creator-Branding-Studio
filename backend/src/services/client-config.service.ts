import { shouldServeStatic, getPublicFirebaseConfig, getPublicStripePublishableKey } from '../config/env.js';

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

export function getPublicClientConfig(): PublicClientConfig {
  return {
    firebase: getPublicFirebaseConfig(),
    stripePublishableKey: getPublicStripePublishableKey() || null,
  };
}

export function isPublicClientConfigReady(): boolean {
  return Boolean(getPublicClientConfig().firebase?.apiKey);
}

/** All-in-one Docker deploy needs runtime PUBLIC_FIREBASE_* (Vite env is not available at image build). */
export function requiresPublicClientConfig(): boolean {
  return shouldServeStatic();
}
