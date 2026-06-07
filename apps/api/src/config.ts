import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

/** Lokal: .env laden. Railway/Production: ausschließlich process.env. */
if (!isProduction) {
  const envPath = resolve(__dirname, '../../../.env');
  if (existsSync(envPath)) {
    config({ path: envPath });
  }
}

function envString(name: string): string {
  return process.env[name]?.trim() ?? '';
}

function envBool(name: string, defaultValue = false): boolean {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return value === 'true';
}

export const env = {
  nodeEnv,
  isProduction,
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: envString('JWT_SECRET'),
  corsOrigin: envString('CORS_ORIGIN') || (isProduction ? '' : 'http://localhost:5173'),
  authProvider: (envString('AUTH_PROVIDER') || 'mock') as 'mock' | 'firebase',
  dbProvider: (envString('DB_PROVIDER') || 'local') as 'local' | 'firestore',
  uploadProvider: (envString('UPLOAD_PROVIDER') || 'local') as 'local' | 'firebase',
  adminEmail: envString('ADMIN_EMAIL'),
  allowMockAuth: envBool('ALLOW_MOCK_AUTH'),
  allowMockPayments: envBool('ALLOW_MOCK_PAYMENTS'),
  rateLimitEnabled: envBool('RATE_LIMIT_ENABLED', true),
  firebaseProjectId: envString('FIREBASE_PROJECT_ID'),
  firebaseClientEmail: envString('FIREBASE_CLIENT_EMAIL'),
  firebasePrivateKey: envString('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
  openaiApiKey: envString('OPENAI_API_KEY'),
  replicateApiToken: envString('REPLICATE_API_TOKEN'),
  runwayApiKey: envString('RUNWAY_API_KEY'),
  stripeSecretKey: envString('STRIPE_SECRET_KEY'),
  stripeWebhookSecret: envString('STRIPE_WEBHOOK_SECRET'),
  paypalClientId: envString('PAYPAL_CLIENT_ID'),
  paypalClientSecret: envString('PAYPAL_CLIENT_SECRET'),
  testMode: envBool('TEST_MODE'),
  dataDir: resolve(__dirname, '../data'),
  assetsDir: resolve(__dirname, '../data/assets'),
  uploadsDir: resolve(__dirname, '../data/uploads'),
  webDistDir: resolve(__dirname, '../../web/dist'),
};

if (isProduction) {
  console.log('[config] webDistDir =', env.webDistDir);
  console.log('[config] webDistExists =', existsSync(env.webDistDir));
  console.log('[config] cwd =', process.cwd());
  console.log('[config] __dirname =', __dirname);
}

export function requireApiKey(provider: 'openai' | 'replicate' | 'runway'): string {
  const map = {
    openai: env.openaiApiKey,
    replicate: env.replicateApiToken,
    runway: env.runwayApiKey,
  };
  const key = map[provider];
  if (!key) {
    throw new Error(
      `Kein API-Schlüssel für ${provider}. Setze ${provider.toUpperCase()}_API_KEY als Environment Variable.`,
    );
  }
  return key;
}

export function requireJwtSecret(): string {
  if (!env.jwtSecret) {
    throw new Error('JWT_SECRET fehlt. Setze JWT_SECRET als Environment Variable.');
  }
  return env.jwtSecret;
}
