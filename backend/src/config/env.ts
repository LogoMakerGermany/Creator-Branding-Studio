/**
 * Central Configuration Service — the ONLY module that reads process.env.
 *
 * All other backend code must import getters from here.
 * Secrets come from Railway Project Variables (production) or the same
 * variable names injected into the process environment for local development.
 * Secret values are never logged.
 */

function readEnv(key: string): string | undefined {
  const value = process.env[key];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requireEnv(key: string): string {
  const value = readEnv(key);
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

// ─── Runtime / server ───────────────────────────────────────────────────────

export function isProduction(): boolean {
  return readEnv('NODE_ENV') === 'production';
}

export function getPort(): number {
  const raw = readEnv('PORT');
  if (!raw) return 8080;
  const port = Number.parseInt(raw, 10);
  return Number.isFinite(port) && port > 0 ? port : 8080;
}

export function shouldServeStatic(): boolean {
  return readEnv('SERVE_STATIC') === 'true';
}

export function getDefaultFreeCoins(): number {
  const raw = readEnv('DEFAULT_FREE_COINS');
  if (!raw) return 50;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 50;
}

export type RegistrationModeEnv = 'closed' | 'invite_only' | 'public';

/** Default for closed beta: invite_only. Overridable via env or system_settings. */
export function getRegistrationModeEnv(): RegistrationModeEnv {
  const raw = readEnv('REGISTRATION_MODE')?.toLowerCase();
  if (raw === 'closed' || raw === 'invite_only' || raw === 'public') return raw;
  return 'invite_only';
}

export function getPriceQuoteTtlMinutes(): number {
  const raw = readEnv('PRICE_QUOTE_TTL_MINUTES');
  if (!raw) return 15;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 15;
}

export function areGenerationsEnabled(): boolean {
  return readEnv('GENERATIONS_ENABLED') !== 'false';
}

export function areImageGenerationsEnabled(): boolean {
  return areGenerationsEnabled() && readEnv('IMAGE_GENERATIONS_ENABLED') !== 'false';
}

export function areVideoGenerationsEnabled(): boolean {
  return areGenerationsEnabled() && readEnv('VIDEO_GENERATIONS_ENABLED') !== 'false';
}

export function arePaymentsEnabled(): boolean {
  return readEnv('PAYMENTS_ENABLED') !== 'false';
}

export function getDailyProviderBudgetCents(): number | null {
  const raw = readEnv('DAILY_PROVIDER_BUDGET_CENTS');
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function getMaxDailyJobsPerUser(): number {
  const raw = readEnv('MAX_DAILY_JOBS_PER_USER');
  if (!raw) return 50;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 50;
}

export function getMaxConcurrentJobsPerUser(): number {
  const raw = readEnv('MAX_CONCURRENT_JOBS_PER_USER');
  if (!raw) return 3;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

export function getMaxDailyPromotionalSpendCents(): number | null {
  const raw = readEnv('MAX_DAILY_PROMOTIONAL_SPEND_CENTS');
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// ─── Firebase Admin (secrets) ───────────────────────────────────────────────

export function getFirebaseProjectId(): string | undefined {
  return readEnv('FIREBASE_PROJECT_ID');
}

export function getFirebaseClientEmail(): string | undefined {
  return readEnv('FIREBASE_CLIENT_EMAIL');
}

/** Private key with escaped newlines normalized. Never log this value. */
export function getFirebasePrivateKey(): string | undefined {
  const raw = readEnv('FIREBASE_PRIVATE_KEY');
  if (!raw) return undefined;
  return raw.replace(/\\n/g, '\n');
}

export function getFirebaseStorageBucket(): string | undefined {
  return readEnv('FIREBASE_STORAGE_BUCKET');
}

export function getFirebaseDatabaseUrl(): string | undefined {
  return readEnv('FIREBASE_DATABASE_URL');
}

export function isFirebaseAdminConfigured(): boolean {
  return Boolean(getFirebaseProjectId() && getFirebaseClientEmail() && getFirebasePrivateKey());
}

export function getFirebaseAdminCredentials(): {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  storageBucket?: string;
  databaseURL?: string;
} {
  const privateKey = getFirebasePrivateKey();
  if (!privateKey) {
    throw new Error('Missing required environment variable: FIREBASE_PRIVATE_KEY');
  }
  return {
    projectId: requireEnv('FIREBASE_PROJECT_ID'),
    clientEmail: requireEnv('FIREBASE_CLIENT_EMAIL'),
    privateKey,
    storageBucket: getFirebaseStorageBucket(),
    databaseURL: getFirebaseDatabaseUrl(),
  };
}

// ─── Dev auth (never in production) ─────────────────────────────────────────

export function isDevAuthBypassExplicit(): boolean {
  return readEnv('DEV_AUTH_BYPASS') === 'true';
}

/** Local JSON store when bypass is on or Admin SDK is missing — never in production. */
export function isDevMode(): boolean {
  if (isProduction()) return false;
  if (isDevAuthBypassExplicit()) return true;
  return !isFirebaseAdminConfigured();
}

/** Dev login / dev_* tokens allowed only outside production. */
export function isDevAuthEnabled(): boolean {
  return !isProduction() && (isDevAuthBypassExplicit() || !isFirebaseAdminConfigured());
}

// ─── Frontend URLs (CORS / redirects) ───────────────────────────────────────

export function getFrontendUrls(): string[] {
  const raw = readEnv('FRONTEND_URLS') || readEnv('FRONTEND_URL') || 'http://localhost:5173';
  const known = [
    'https://creatorbrandingstudioultimate-production.up.railway.app',
    'https://creatorstudio-519eb.web.app',
    'https://creatorstudio-519eb.firebaseapp.com',
  ];
  const urls = raw
    .split(',')
    .map((u) => u.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return [...new Set([...urls, ...known])];
}

export function getPrimaryFrontendUrl(): string {
  return getFrontendUrls()[0] || 'http://localhost:5173';
}

// ─── Stripe (secrets + price IDs) ───────────────────────────────────────────

export function getStripeSecretKey(): string | undefined {
  return readEnv('STRIPE_SECRET_KEY');
}

export function getStripeWebhookSecret(): string | undefined {
  return readEnv('STRIPE_WEBHOOK_SECRET');
}

export function getStripePriceStarter(): string | undefined {
  return readEnv('STRIPE_PRICE_STARTER');
}

export function getStripePricePro(): string | undefined {
  return readEnv('STRIPE_PRICE_PRO');
}

export function getStripePriceUltimate(): string | undefined {
  return readEnv('STRIPE_PRICE_ULTIMATE');
}

export function getStripePriceId(packageId: string): string | undefined {
  const map: Record<string, string | undefined> = {
    starter: getStripePriceStarter(),
    pro: getStripePricePro(),
    ultimate: getStripePriceUltimate(),
  };
  return map[packageId];
}

export function isStripeConfigured(): boolean {
  return Boolean(getStripeSecretKey());
}

export function getStripeMode(): 'live' | 'test' | 'disabled' {
  const key = getStripeSecretKey();
  if (!key) return 'disabled';
  return key.startsWith('sk_live_') ? 'live' : 'test';
}

export function isStripeLiveMode(): boolean {
  return getStripeMode() === 'live';
}

// ─── PayPal ─────────────────────────────────────────────────────────────────

export function getPayPalClientId(): string | undefined {
  return readEnv('PAYPAL_CLIENT_ID');
}

export function getPayPalClientSecret(): string | undefined {
  return readEnv('PAYPAL_CLIENT_SECRET');
}

export function getPayPalWebhookId(): string | undefined {
  return readEnv('PAYPAL_WEBHOOK_ID');
}

export function isPayPalConfigured(): boolean {
  return Boolean(getPayPalClientId() && getPayPalClientSecret());
}

export function getPayPalMode(): 'live' | 'sandbox' | 'disabled' {
  if (!isPayPalConfigured()) return 'disabled';
  const mode = readEnv('PAYPAL_MODE')?.toLowerCase();
  if (mode === 'live') return 'live';
  if (mode === 'sandbox') return 'sandbox';
  return 'sandbox';
}

export function isPayPalLiveMode(): boolean {
  return getPayPalMode() === 'live';
}

// ─── AI providers (secrets) ─────────────────────────────────────────────────

export function getOpenAiApiKey(): string | undefined {
  return readEnv('OPENAI_API_KEY');
}

export function getGeminiApiKey(): string | undefined {
  return readEnv('GEMINI_API_KEY');
}

export function getReplicateApiToken(): string | undefined {
  return readEnv('REPLICATE_API_TOKEN');
}

export function getRunwayApiKey(): string | undefined {
  return readEnv('RUNWAY_API_KEY');
}

export function getElevenLabsApiKey(): string | undefined {
  return readEnv('ELEVENLABS_API_KEY');
}

export function getElevenLabsVoiceId(): string {
  return readEnv('ELEVENLABS_VOICE_ID') || '21m00Tcm4TlvDq8ikWAM';
}

export function getSunoApiKey(): string | undefined {
  return readEnv('SUNO_API_KEY');
}

export function getReplicateVideoModel(): string {
  return readEnv('REPLICATE_VIDEO_MODEL') || 'minimax/video-01';
}

export function getJwtSecret(): string | undefined {
  return readEnv('JWT_SECRET');
}

export function getAiProviderStatus() {
  return {
    openai: Boolean(getOpenAiApiKey()),
    gemini: Boolean(getGeminiApiKey()),
    replicate: Boolean(getReplicateApiToken()),
    runway: Boolean(getRunwayApiKey()),
    elevenlabs: Boolean(getElevenLabsApiKey()),
    suno: Boolean(getSunoApiKey()),
  };
}

export function hasImageAiProvider(): boolean {
  return Boolean(getOpenAiApiKey() || getReplicateApiToken());
}

// ─── Public client config (safe for browser) ────────────────────────────────

export function getPublicFirebaseApiKey(): string | undefined {
  return readEnv('PUBLIC_FIREBASE_API_KEY');
}

export function getPublicFirebaseProjectId(): string | undefined {
  return readEnv('PUBLIC_FIREBASE_PROJECT_ID');
}

export function getPublicFirebaseAuthDomain(): string | undefined {
  return readEnv('PUBLIC_FIREBASE_AUTH_DOMAIN');
}

export function getPublicFirebaseStorageBucket(): string | undefined {
  return readEnv('PUBLIC_FIREBASE_STORAGE_BUCKET');
}

export function getPublicFirebaseMessagingSenderId(): string | undefined {
  return readEnv('PUBLIC_FIREBASE_MESSAGING_SENDER_ID');
}

export function getPublicFirebaseAppId(): string | undefined {
  return readEnv('PUBLIC_FIREBASE_APP_ID');
}

export function getPublicStripePublishableKey(): string | undefined {
  return readEnv('PUBLIC_STRIPE_PUBLISHABLE_KEY');
}

export function getPublicFirebaseConfig(): {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
} | null {
  const apiKey = getPublicFirebaseApiKey();
  const projectId = getPublicFirebaseProjectId();
  if (!apiKey || !projectId) return null;

  return {
    apiKey,
    authDomain: getPublicFirebaseAuthDomain() || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: getPublicFirebaseStorageBucket() || `${projectId}.appspot.com`,
    messagingSenderId: getPublicFirebaseMessagingSenderId() || '',
    appId: getPublicFirebaseAppId() || '',
  };
}

export function isPublicClientConfigReady(): boolean {
  return Boolean(getPublicFirebaseConfig()?.apiKey);
}

export function requiresPublicClientConfig(): boolean {
  return shouldServeStatic();
}

// ─── Streaming ──────────────────────────────────────────────────────────────

export function getRtmpConfig() {
  return {
    server: readEnv('RTMP_SERVER_URL') || 'rtmp://live.ucbs.dev/app',
    appName: readEnv('RTMP_APP_NAME') || 'app',
    provider: readEnv('RTMP_PROVIDER') || 'custom',
  };
}

export function getHlsConfig() {
  return {
    playbackBaseUrl: readEnv('HLS_PLAYBACK_BASE_URL') || '',
    demoPlaybackUrl:
      readEnv('HLS_DEMO_PLAYBACK_URL') ||
      'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8',
    useDemoInDev: readEnv('HLS_USE_DEMO') !== 'false',
  };
}

/** Build HLS playback URL from stream key template or demo stream in dev. */
export function buildHlsPlaybackUrl(streamKey: string): string {
  const { playbackBaseUrl, demoPlaybackUrl, useDemoInDev } = getHlsConfig();

  if (playbackBaseUrl) {
    return playbackBaseUrl.replace('{streamKey}', streamKey);
  }

  if (useDemoInDev && (isDevMode() || !isProduction())) {
    return demoPlaybackUrl;
  }

  return '';
}

// ─── Validation helpers (no secret values in messages) ──────────────────────

export interface ConfigValidationIssue {
  variable: string;
  message: string;
}

/**
 * Collect production configuration issues. Does not include secret values.
 * Callers decide whether to exit.
 */
export function collectProductionConfigIssues(): ConfigValidationIssue[] {
  const issues: ConfigValidationIssue[] = [];

  if (isDevAuthBypassExplicit()) {
    issues.push({
      variable: 'DEV_AUTH_BYPASS',
      message: 'must not be enabled in production',
    });
  }

  for (const key of [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_STORAGE_BUCKET',
  ] as const) {
    if (!readEnv(key)) {
      issues.push({ variable: key, message: 'is missing' });
    }
  }

  const privateKey = getFirebasePrivateKey();
  if (privateKey && !privateKey.includes('BEGIN') && !privateKey.includes('PRIVATE KEY')) {
    issues.push({
      variable: 'FIREBASE_PRIVATE_KEY',
      message: 'does not look like a valid PEM private key',
    });
  }

  if (!readEnv('FRONTEND_URL') && !readEnv('FRONTEND_URLS')) {
    issues.push({
      variable: 'FRONTEND_URL',
      message: 'FRONTEND_URL or FRONTEND_URLS must be set in production',
    });
  }

  if (!getStripeSecretKey()) {
    issues.push({ variable: 'STRIPE_SECRET_KEY', message: 'is missing' });
  } else if (!getStripeSecretKey()!.startsWith('sk_')) {
    issues.push({
      variable: 'STRIPE_SECRET_KEY',
      message: 'has an invalid format (expected sk_…)',
    });
  }

  if (!getStripeWebhookSecret()) {
    issues.push({ variable: 'STRIPE_WEBHOOK_SECRET', message: 'is missing' });
  } else if (!getStripeWebhookSecret()!.startsWith('whsec_')) {
    issues.push({
      variable: 'STRIPE_WEBHOOK_SECRET',
      message: 'has an invalid format (expected whsec_…)',
    });
  }

  if (isPayPalConfigured()) {
    if (getPayPalMode() !== 'live') {
      issues.push({
        variable: 'PAYPAL_MODE',
        message: 'must be "live" when PayPal is configured in production',
      });
    }
    if (!getPayPalWebhookId()) {
      issues.push({
        variable: 'PAYPAL_WEBHOOK_ID',
        message: 'is required when PayPal is configured in production',
      });
    }
  }

  if (!hasImageAiProvider()) {
    issues.push({
      variable: 'OPENAI_API_KEY',
      message: 'at least one image AI provider is required (OPENAI_API_KEY or REPLICATE_API_TOKEN)',
    });
  }

  if (requiresPublicClientConfig() && !isPublicClientConfigReady()) {
    issues.push({
      variable: 'PUBLIC_FIREBASE_API_KEY',
      message:
        'PUBLIC_FIREBASE_API_KEY and PUBLIC_FIREBASE_PROJECT_ID are required when SERVE_STATIC=true',
    });
  }

  return issues;
}
