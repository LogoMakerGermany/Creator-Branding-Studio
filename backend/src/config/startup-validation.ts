import {
  isProduction,
  isFirebaseAdminConfigured,
  isDevAuthBypassExplicit,
  getFrontendUrls,
  isStripeConfigured,
  getAiProviderStatus,
} from './env.js';
import { requiresPublicClientConfig, isPublicClientConfigReady } from '../services/client-config.service.js';

/**
 * Fail fast in production if secrets or security settings are misconfigured.
 * All server secrets must live in Railway (or local backend/.env), never in the frontend.
 */
export function validateProductionConfig(): void {
  if (!isProduction()) {
    return;
  }

  const errors: string[] = [];

  if (isDevAuthBypassExplicit()) {
    errors.push('DEV_AUTH_BYPASS must not be enabled in production');
  }

  if (!isFirebaseAdminConfigured()) {
    errors.push('Firebase Admin credentials (FIREBASE_*) are required in production');
  }

  if (getFrontendUrls().length === 0) {
    errors.push('FRONTEND_URL or FRONTEND_URLS must be set in production');
  }

  const required = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
  for (const key of required) {
    if (!process.env[key]?.trim()) {
      errors.push(`${key} is missing`);
    }
  }

  if (!isStripeConfigured()) {
    errors.push('STRIPE_SECRET_KEY is required in production');
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET?.trim()) {
    errors.push('STRIPE_WEBHOOK_SECRET is required in production');
  }

  const ai = getAiProviderStatus();
  if (!ai.openai && !ai.replicate) {
    errors.push('At least one image AI provider is required (OPENAI_API_KEY or REPLICATE_API_TOKEN)');
  }

  if (!process.env.FIREBASE_STORAGE_BUCKET?.trim()) {
    errors.push('FIREBASE_STORAGE_BUCKET is required in production');
  }

  if (requiresPublicClientConfig() && !isPublicClientConfigReady()) {
    errors.push(
      'PUBLIC_FIREBASE_API_KEY and PUBLIC_FIREBASE_PROJECT_ID are required when SERVE_STATIC=true (Railway all-in-one)'
    );
  }

  if (errors.length > 0) {
    console.error('[Security] Production startup blocked:');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    console.error('[Security] Configure secrets in Railway Variables only — never in frontend or git.');
    process.exit(1);
  }
}
