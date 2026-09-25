import {
  areGenerationsEnabled,
  areImageEditsEnabled,
  areImageGenerationsEnabled,
  areMusicGenerationsEnabled,
  arePaymentsEnabled,
  areTextGenerationsEnabled,
  areVideoGenerationsEnabled,
  getElevenLabsApiKey,
  getEmailFrom,
  getFirebaseClientEmail,
  getFirebasePrivateKey,
  getFirebaseProjectId,
  getFirebaseStorageBucket,
  getOpenAiApiKey,
  getPayPalClientId,
  getPayPalClientSecret,
  getPayPalWebhookId,
  getPublicFirebaseApiKey,
  getPublicFirebaseAppId,
  getPublicFirebaseProjectId,
  getReplicateApiToken,
  getResendApiKey,
  getRunwayApiKey,
  getStripeSecretKey,
  getStripeWebhookSecret,
  isConfiguredVariablePresent,
  isNexterChatEnabled,
  isTextGenerationsFlagEnabled,
  isCaptionsGenerationsFlagEnabled,
  isTransactionalEmailConfigured,
  isTtsGenerationEnabled,
  shouldServeStatic,
} from '../config/env.js';

export type ReadinessStatus = 'READY' | 'NOT READY';

export interface ReadinessVariable {
  name: string;
  present: boolean;
}

export interface ReadinessRow {
  feature: string;
  flag: string | null;
  /** null when the feature has no on/off flag. */
  flagEnabled: boolean | null;
  variables: ReadinessVariable[];
  /** At least one listed variable must be present, together with the flag. */
  anyVariable?: boolean;
  optional: boolean;
  status: ReadinessStatus;
}

export interface ReadinessReport {
  checkedAt: string;
  liveChecked: false;
  rows: ReadinessRow[];
}

function variable(name: string, present: boolean): ReadinessVariable {
  return { name, present: present === true };
}

function row(input: {
  feature: string;
  flag: string | null;
  flagEnabled: boolean | null;
  variables: ReadinessVariable[];
  anyVariable?: boolean;
  optional?: boolean;
  forceNotReady?: boolean;
}): ReadinessRow {
  const secretsReady = input.anyVariable
    ? input.variables.some((item) => item.present)
    : input.variables.every((item) => item.present);
  const flagReady = input.flagEnabled !== false;
  const status: ReadinessStatus =
    input.forceNotReady || !flagReady || !secretsReady ? 'NOT READY' : 'READY';
  return {
    feature: input.feature,
    flag: input.flag,
    flagEnabled: input.flagEnabled,
    variables: input.variables,
    ...(input.anyVariable ? { anyVariable: true } : {}),
    optional: input.optional === true,
    status,
  };
}

/** Names and booleans only. Never returns secret values, fragments, or lengths. */
export function buildReadinessReport(now = new Date().toISOString()): ReadinessReport {
  const openai = Boolean(getOpenAiApiKey());
  const replicate = Boolean(getReplicateApiToken());
  const runway = Boolean(getRunwayApiKey());
  const eleven = Boolean(getElevenLabsApiKey());

  return {
    checkedAt: now,
    liveChecked: false,
    rows: [
      row({
        feature: 'Firebase Admin',
        flag: null,
        flagEnabled: null,
        variables: [
          variable('FIREBASE_PROJECT_ID', Boolean(getFirebaseProjectId())),
          variable('FIREBASE_CLIENT_EMAIL', Boolean(getFirebaseClientEmail())),
          variable('FIREBASE_PRIVATE_KEY', Boolean(getFirebasePrivateKey())),
          variable('FIREBASE_STORAGE_BUCKET', Boolean(getFirebaseStorageBucket())),
        ],
      }),
      row({
        feature: 'Public Firebase client',
        flag: 'SERVE_STATIC',
        flagEnabled: shouldServeStatic(),
        optional: !shouldServeStatic(),
        variables: [
          variable('PUBLIC_FIREBASE_API_KEY', Boolean(getPublicFirebaseApiKey())),
          variable('PUBLIC_FIREBASE_PROJECT_ID', Boolean(getPublicFirebaseProjectId())),
          variable('PUBLIC_FIREBASE_APP_ID', Boolean(getPublicFirebaseAppId())),
        ],
      }),
      row({
        feature: 'Text generation',
        flag: 'TEXT_GENERATIONS_ENABLED',
        flagEnabled: isTextGenerationsFlagEnabled() && areGenerationsEnabled(),
        variables: [variable('OPENAI_API_KEY', openai)],
      }),
      row({
        feature: 'Automatic captions',
        flag: 'CAPTIONS_GENERATIONS_ENABLED',
        flagEnabled: isCaptionsGenerationsFlagEnabled() && areGenerationsEnabled(),
        variables: [variable('OPENAI_API_KEY', openai)],
      }),
      row({
        feature: 'Nexter chat',
        flag: 'NEXTER_CHAT_ENABLED',
        flagEnabled: isNexterChatEnabled(),
        variables: [variable('OPENAI_API_KEY', openai)],
      }),
      row({
        feature: 'Live images',
        flag: 'IMAGE_GENERATIONS_ENABLED',
        flagEnabled: areImageGenerationsEnabled(),
        anyVariable: true,
        variables: [
          variable('OPENAI_API_KEY', openai),
          variable('REPLICATE_API_TOKEN', replicate),
        ],
      }),
      row({
        feature: 'Image edit',
        flag: 'IMAGE_EDITS_ENABLED',
        flagEnabled: areImageEditsEnabled(),
        optional: true,
        variables: [variable('OPENAI_API_KEY', openai)],
      }),
      row({
        feature: 'Video and animation',
        flag: 'VIDEO_GENERATIONS_ENABLED',
        flagEnabled: areVideoGenerationsEnabled(),
        anyVariable: true,
        variables: [
          variable('RUNWAY_API_KEY', runway),
          variable('REPLICATE_API_TOKEN', replicate),
        ],
      }),
      row({
        feature: 'Music',
        flag: 'MUSIC_GENERATIONS_ENABLED',
        flagEnabled: areMusicGenerationsEnabled(),
        variables: [variable('REPLICATE_API_TOKEN', replicate)],
      }),
      row({
        feature: 'Catalog TTS',
        flag: 'TTS_GENERATION_ENABLED',
        flagEnabled: isTtsGenerationEnabled(),
        variables: [variable('ELEVENLABS_API_KEY', eleven)],
      }),
      row({
        feature: 'Payments',
        flag: 'PAYMENTS_ENABLED',
        flagEnabled: arePaymentsEnabled(),
        variables: [
          variable('STRIPE_SECRET_KEY', Boolean(getStripeSecretKey())),
          variable('STRIPE_WEBHOOK_SECRET', Boolean(getStripeWebhookSecret())),
        ],
      }),
      row({
        feature: 'PayPal',
        flag: 'PAYMENTS_ENABLED',
        flagEnabled: arePaymentsEnabled(),
        optional: true,
        variables: [
          variable('PAYPAL_CLIENT_ID', Boolean(getPayPalClientId())),
          variable('PAYPAL_CLIENT_SECRET', Boolean(getPayPalClientSecret())),
          variable('PAYPAL_WEBHOOK_ID', Boolean(getPayPalWebhookId())),
        ],
      }),
      row({
        feature: 'Transactional email',
        flag: null,
        flagEnabled: null,
        optional: true,
        variables: [
          variable('RESEND_API_KEY', Boolean(getResendApiKey())),
          variable('EMAIL_FROM', Boolean(getEmailFrom())),
        ],
        forceNotReady: !isTransactionalEmailConfigured(),
      }),
      row({
        feature: 'Discord login',
        flag: null,
        flagEnabled: null,
        optional: true,
        variables: [
          variable('DISCORD_CLIENT_ID', isConfiguredVariablePresent('DISCORD_CLIENT_ID')),
          variable('DISCORD_CLIENT_SECRET', isConfiguredVariablePresent('DISCORD_CLIENT_SECRET')),
        ],
      }),
      row({
        feature: 'Twitch login',
        flag: null,
        flagEnabled: null,
        optional: true,
        variables: [
          variable('TWITCH_CLIENT_ID', isConfiguredVariablePresent('TWITCH_CLIENT_ID')),
          variable('TWITCH_CLIENT_SECRET', isConfiguredVariablePresent('TWITCH_CLIENT_SECRET')),
        ],
      }),
      row({
        feature: 'TikTok login',
        flag: null,
        flagEnabled: null,
        optional: true,
        variables: [
          variable('TIKTOK_CLIENT_ID', isConfiguredVariablePresent('TIKTOK_CLIENT_ID')),
          variable('TIKTOK_CLIENT_SECRET', isConfiguredVariablePresent('TIKTOK_CLIENT_SECRET')),
        ],
      }),
      row({
        feature: 'Microsoft login',
        flag: null,
        flagEnabled: null,
        optional: true,
        variables: [variable('MICROSOFT_CLIENT_ID', isConfiguredVariablePresent('MICROSOFT_CLIENT_ID'))],
      }),
    ],
  };
}

export function readinessReportLeaksSecrets(report: ReadinessReport, forbidden: string[]): boolean {
  const dumped = JSON.stringify(report);
  return forbidden.some((value) => value.length > 0 && dumped.includes(value));
}
