import { env } from './config.js';

const WEAK_JWT_SECRETS = new Set(['dev-secret-change-me', 'change-me', 'secret']);

export function validateEnvOnStartup(): void {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!env.jwtSecret) {
    const msg = 'JWT_SECRET fehlt – Login/Auth funktioniert nicht';
    if (env.isProduction) errors.push(msg);
    else warnings.push(msg);
  } else if (env.jwtSecret.length < 32 || WEAK_JWT_SECRETS.has(env.jwtSecret)) {
    const msg = 'JWT_SECRET ist zu schwach (mindestens 32 Zeichen, kein Default)';
    if (env.isProduction) errors.push(msg);
    else warnings.push(msg);
  }

  if (!env.corsOrigin) {
    errors.push('CORS_ORIGIN fehlt – Frontend kann API nicht sicher ansprechen');
  }

  if (!env.openaiApiKey && !env.replicateApiToken) {
    warnings.push('OPENAI_API_KEY und REPLICATE_API_TOKEN fehlen – KI-Generierung deaktiviert');
  }

  if (!env.runwayApiKey && !env.replicateApiToken) {
    warnings.push('RUNWAY_API_KEY und REPLICATE_API_TOKEN fehlen – Video-Generierung eingeschränkt');
  }

  if (!env.stripeSecretKey) {
    warnings.push('STRIPE_SECRET_KEY fehlt – Coin-Shop via Stripe deaktiviert');
  }

  if (env.stripeSecretKey && !env.stripeWebhookSecret) {
    const msg = 'STRIPE_WEBHOOK_SECRET fehlt bei gesetztem STRIPE_SECRET_KEY';
    if (env.isProduction) errors.push(msg);
    else warnings.push(msg);
  }

  if (env.stripeSecretKey && /^pk_/.test(env.stripeSecretKey.trim())) {
    errors.push('STRIPE_SECRET_KEY enthält einen Publishable Key (pk_) – Secret Key (sk_) erforderlich');
  }

  if (env.authProvider !== 'firebase') {
    errors.push('AUTH_PROVIDER muss firebase sein – Mock-Auth ist deaktiviert');
  }

  if (env.authProvider === 'firebase') {
    if (!env.firebaseProjectId || !env.firebaseClientEmail || !env.firebasePrivateKey) {
      const msg = 'Firebase Auth erfordert FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL und FIREBASE_PRIVATE_KEY';
      if (env.isProduction) errors.push(msg);
      else warnings.push(msg);
    }
  }

  if (env.paypalClientId && !env.paypalClientSecret) {
    warnings.push('PAYPAL_CLIENT_SECRET fehlt bei gesetztem PAYPAL_CLIENT_ID');
  }

  if (env.isProduction) {
    if (env.allowMockPayments) errors.push('ALLOW_MOCK_PAYMENTS darf in Production nicht true sein');
    if (env.testMode) warnings.push('TEST_MODE=true in Production – nur für Staging empfohlen');
  } else {
    if (env.allowMockPayments) warnings.push('ALLOW_MOCK_PAYMENTS aktiv – Gratis-Coins ohne Zahlungsanbieter');
  }

  for (const warning of warnings) {
    console.warn(`[env] ⚠ ${warning}`);
  }

  if (errors.length > 0) {
    throw new Error(`Environment ungültig:\n- ${errors.join('\n- ')}`);
  }

  console.info(`[env] ✓ Startup-Check OK (${env.nodeEnv}, auth=${env.authProvider}, db=${env.dbProvider})`);
}

/** @deprecated Alias */
export const validateProductionEnv = validateEnvOnStartup;
