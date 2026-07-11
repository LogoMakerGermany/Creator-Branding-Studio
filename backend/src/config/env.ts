/**
 * Central production / environment helpers.
 */

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function isFirebaseAdminConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
  );
}

/** Local JSON store + dev tokens — never in production. */
export function isDevMode(): boolean {
  if (isProduction()) {
    return false;
  }
  if (process.env.DEV_AUTH_BYPASS === 'true') {
    return true;
  }
  return !isFirebaseAdminConfigured();
}

/** Dev login / dev_* tokens allowed only outside production. */
export function isDevAuthEnabled(): boolean {
  return !isProduction() && (process.env.DEV_AUTH_BYPASS === 'true' || !isFirebaseAdminConfigured());
}

export function isDevAuthBypassExplicit(): boolean {
  return process.env.DEV_AUTH_BYPASS === 'true';
}

export function getFrontendUrls(): string[] {
  const raw = process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:5173';
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

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripeMode(): 'live' | 'test' | 'disabled' {
  if (!isStripeConfigured()) return 'disabled';
  return process.env.STRIPE_SECRET_KEY!.startsWith('sk_live_') ? 'live' : 'test';
}

export function isStripeLiveMode(): boolean {
  return getStripeMode() === 'live';
}

export function getRtmpConfig() {
  return {
    server: process.env.RTMP_SERVER_URL || 'rtmp://live.ucbs.dev/app',
    appName: process.env.RTMP_APP_NAME || 'app',
    provider: process.env.RTMP_PROVIDER || 'custom',
  };
}

export function getAiProviderStatus() {
  return {
    openai: Boolean(process.env.OPENAI_API_KEY),
    replicate: Boolean(process.env.REPLICATE_API_TOKEN),
    runway: Boolean(process.env.RUNWAY_API_KEY),
    elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
    suno: Boolean(process.env.SUNO_API_KEY),
  };
}

export function getHlsConfig() {
  return {
    playbackBaseUrl: process.env.HLS_PLAYBACK_BASE_URL || '',
    demoPlaybackUrl:
      process.env.HLS_DEMO_PLAYBACK_URL ||
      'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8',
    useDemoInDev: process.env.HLS_USE_DEMO !== 'false',
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
