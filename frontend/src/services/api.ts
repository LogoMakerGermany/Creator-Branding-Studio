import { isFirebaseConfigured } from '@/lib/runtime-config';
import { AUTH_TOKEN_STORAGE_KEY, resolveAuthRequestToken } from '@/lib/auth-session';
import type {
  BannerGenerationOptions,
  FacecamGenerationOptions,
  LogoGenerationOptions,
  OverlayGenerationOptions,
  StickerGenerationOptions,
  StudioModuleKey,
  StudioProjectSummary,
  CreatorDNA,
  DNAAnalysis,
  DNAVersion,
  VideoEditPlan,
  VideoMetadata,
  VideoScene,
  VideoPause,
  VideoCrop,
} from '@ucbs/shared';

export type { CreatorDNA, DNAAnalysis, DNAVersion };

type StudioGenerateOptions = (
  | LogoGenerationOptions
  | BannerGenerationOptions
  | FacecamGenerationOptions
  | OverlayGenerationOptions
  | StickerGenerationOptions
) & { projectId?: string };

export type { StudioProjectSummary };

const API_URL = import.meta.env.VITE_API_URL || '';

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public requestId?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let lastApiRequestId: string | undefined;

export function getLastApiRequestId(): string | undefined {
  return lastApiRequestId;
}

function rememberRequestId(res: Response, bodyRequestId?: string): void {
  const id = bodyRequestId || res.headers.get('x-request-id') || undefined;
  if (id) lastApiRequestId = id;
}

function readLegacyAuthToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

async function getToken(): Promise<string | null> {
  if (isFirebaseConfigured()) {
    const { getIdToken } = await import('@/lib/firebase');
    return resolveAuthRequestToken({
      firebaseConfigured: true,
      firebaseIdToken: await getIdToken(),
      legacyStoredToken: readLegacyAuthToken(),
    });
  }

  return resolveAuthRequestToken({
    firebaseConfigured: false,
    firebaseIdToken: null,
    legacyStoredToken: readLegacyAuthToken(),
  });
}

export async function getAuthRequestToken(): Promise<string | null> {
  return getToken();
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = await getToken();

  let res: Response;
  try {
    res = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
    });
  } catch {
    throw new ApiError(
      'Server nicht erreichbar. Bitte kurz warten und erneut versuchen.',
      'NETWORK_ERROR',
      0
    );
  }

  let data: { success?: boolean; error?: { message?: string; code?: string; requestId?: string }; data?: T };
  try {
    data = await res.json();
  } catch {
    throw new ApiError(
      res.ok ? 'Ungültige Server-Antwort' : `Server-Fehler (${res.status})`,
      'INVALID_RESPONSE',
      res.status,
      res.headers.get('x-request-id') || undefined
    );
  }

  rememberRequestId(res, data.error?.requestId);

  if (!data.success) {
    const code = data.error?.code || 'UNKNOWN';
    const requestId = data.error?.requestId || res.headers.get('x-request-id') || undefined;
    const friendly: Record<string, string> = {
      AI_NOT_CONFIGURED: 'KI-Funktion nicht konfiguriert. Ein Provider-Key fehlt.',
      IMAGE_GENERATION_UNAVAILABLE:
        'Die Bildgenerierung ist momentan nicht verfügbar. Es wurden keine Coins abgebucht.',
      VIDEO_PROVIDER_UNAVAILABLE:
        'Die KI-Videogenerierung ist momentan nicht verfügbar. Es wurden keine Coins abgebucht.',
      MUSIC_PROVIDER_UNAVAILABLE:
        'Die Musikgenerierung ist momentan nicht verfügbar. Es wurden keine Coins abgebucht.',
      MUSIC_REQUIRES_QUOTE: 'Musik startet nur über Nexter nach Bestätigung.',
      MUSIC_INVALID_AUDIO: 'Die Musikgenerierung lieferte keine gültige Audiodatei. Coins wurden erstattet.',
      MUSIC_DOWNLOAD_TIMEOUT: 'Der Audio-Download hat zu lange gedauert. Coins wurden erstattet.',
      MUSIC_PROVIDER_FAILED: 'Die Musikgenerierung ist fehlgeschlagen. Coins wurden erstattet.',
      MUSIC_STORAGE_ERROR: 'Die Musikdatei konnte nicht gespeichert werden. Coins wurden erstattet.',
      PROVIDER_UNAVAILABLE: 'Die Bildgenerierung ist fehlgeschlagen. Coins wurden erstattet.',
      PROVIDER_TIMEOUT: 'Die Bildgenerierung hat zu lange gedauert. Coins wurden erstattet.',
      PROVIDER_ERROR: 'Die Bildgenerierung ist fehlgeschlagen. Coins wurden erstattet.',
      PROVIDER_INVALID_PAYLOAD: 'Die Bildgenerierung lieferte kein gültiges Bild. Coins wurden erstattet.',
      STORAGE_ERROR: 'Das Bild konnte nicht gespeichert werden. Coins wurden erstattet.',
      ULTIMATE_REQUIRES_QUOTE: 'Ultimate-Creator-Paket startet nur über Nexter nach Bestätigung.',
      VIDEO_REQUIRES_QUOTE: 'KI-Video startet nur über Nexter nach Bestätigung.',
      INTRO_REQUIRES_QUOTE: 'Intro/Outro startet nur über Nexter nach Bestätigung.',
      VTUBER_REQUIRES_QUOTE: 'VTuber-Generierung startet nur über Nexter nach Bestätigung.',
      GENERATIONS_DISABLED: 'Generierung ist momentan nicht verfügbar. Es wurden keine Coins abgebucht.',
      NEXTER_CHAT_LIMIT: 'Nexter-Chat-Limit erreicht. Bitte später erneut versuchen.',
      SPEAK_RATE_LIMIT: 'Bitte kurz warten, bevor die Sprachausgabe erneut gestartet wird.',
      AI_UNAVAILABLE: 'AI PROVIDER NOT CONFIGURED. Nexter-Chat ist nicht verfügbar, Studios funktionieren weiter.',
      AI_TIMEOUT: 'Nexter-Chat zeitüberschritten. Bitte später erneut versuchen.',
      AI_PROVIDER_ERROR: 'Nexter-Chat ist gerade nicht erreichbar. Studios funktionieren weiter.',
      AI_INVALID_RESPONSE: 'Nexter-Chat hat keine gültige Antwort geliefert.',
      INSUFFICIENT_COINS: 'Nicht genügend Coins.',
      FILE_MISSING: 'Datei nicht verfügbar.',
      RETRY_NOT_ALLOWED: 'Dieser Versuch ist nicht möglich.',
      RETRY_REQUIRES_QUOTE: 'Neuer Versuch ist kostenpflichtig. Bitte bestätigen.',
      PRICE_CHANGED: 'Der Preis hat sich geändert. Bitte erneut bestätigen.',
      QUOTE_EXPIRED: 'Das Angebot ist abgelaufen. Bitte neu anfragen.',
      QUOTE_USED: 'Dieses Angebot wurde bereits verwendet.',
      DAILY_JOB_LIMIT: 'Tägliches Job-Limit erreicht.',
      CONCURRENT_JOB_LIMIT: 'Zu viele laufende Jobs. Bitte warten.',
      ACCOUNT_DISABLED: 'Dieses Konto ist deaktiviert.',
      VALIDATION_ERROR: 'Ungültige Eingabe.',
      CHANGE_REQUIRES_QUOTE: 'Änderung braucht ein bestätigtes Nexter-Angebot.',
      SOURCE_MISSING: 'Die Ausgangsdatei fehlt oder wurde gelöscht. Es wurde nichts abgebucht.',
      INVALID_CHANGE: 'Bitte den Änderungswunsch prüfen — er darf nicht leer sein und hat eine maximale Länge.',
      CHANGE_NOT_SUPPORTED: 'Diese Änderung ist so nicht möglich.',
      DNA_CONFIRMATION_REQUIRED: 'DNA-Änderungen brauchen eine explizite Bestätigung in der Creator DNA.',
      FEATURE_NOT_AVAILABLE: 'Diese Funktion ist in NEXTER V1 nicht verfügbar.',
      NETWORK_ERROR: 'Netzwerkfehler. Bitte Verbindung prüfen.',
      PAYMENT_FAILED: 'Zahlung fehlgeschlagen. Es wurden keine Coins gutgeschrieben.',
      PAYMENTS_DISABLED: 'Zahlungen sind derzeit deaktiviert.',
      INVALID_UPLOAD: 'Datei ungültig. Bitte ein unterstütztes Format wählen.',
      UPLOAD_FAILED: 'Upload fehlgeschlagen. Bitte erneut versuchen.',
      FILE_TOO_LARGE: 'Datei ist zu groß.',
      INTERNAL_ERROR: 'Ein interner Fehler ist aufgetreten. Bitte später erneut versuchen.',
      EMAIL_NOT_APPLICABLE: 'Diese Einladung hat keine zugewiesene E-Mail-Adresse.',
      EXPORT_FAILED: 'Export fehlgeschlagen. Bitte erneut versuchen.',
      INVITE_REQUIRED: 'Einladungscode erforderlich — NEXTER ist derzeit nur mit Einladung zugänglich',
      INVITE_INVALID: 'Ungültiger oder inaktiver Einladungscode',
      INVITE_EXPIRED: 'Einladungscode ist abgelaufen',
      INVITE_EXHAUSTED: 'Einladungscode wurde bereits zu oft verwendet',
      INVITE_EMAIL_MISMATCH:
        'Dieser Einladungscode ist an eine E-Mail-Adresse gebunden. Melde dich mit der eingeladenen E-Mail-Adresse an.',
      INVITE_EMAIL_REQUIRED:
        'Dieser Einladungscode ist an eine E-Mail-Adresse gebunden. Der gewählte Anbieter stellt für diese Anmeldung keine bestätigbare E-Mail-Adresse bereit. Melde dich zuerst mit der eingeladenen E-Mail-Adresse an und verknüpfe den Anbieter anschließend in deinen Einstellungen.',
    };
    throw new ApiError(
      friendly[code] || data.error?.message || `Fehler (${res.status})`,
      code,
      res.status,
      requestId
    );
  }
  rememberRequestId(res, data.error?.requestId);
  return data.data as T;
}

export const api = {
  status: () => request<PlatformStatus>('/api/v1/status'),
  auth: {
    devLogin: (email?: string, displayName?: string) =>
      request<{ token: string; user: UserProfile }>('/api/v1/auth/dev-login', {
        method: 'POST',
        body: JSON.stringify({ email, displayName }),
      }),
    me: () =>
      request<{
        user: UserProfile;
        activeDna: CreatorDNA | null;
        emailVerified?: boolean;
        signInProvider?: string | null;
        needsEmailVerification?: boolean;
      }>('/api/v1/auth/me'),
    registrationStatus: () =>
      request<{
        registrationMode: 'closed' | 'invite_only' | 'public';
        registrationOpen: boolean;
        inviteRequired: boolean;
      }>('/api/v1/auth/registration-status'),
    validateInvite: (code: string, email?: string) =>
      request<{ valid: boolean; grantRole?: 'user' | 'tester'; message?: string }>(
        '/api/v1/auth/validate-invite',
        { method: 'POST', body: JSON.stringify({ code, email }) }
      ),
    sync: (
      displayName?: string,
      authProvider?: string,
      inviteCode?: string,
      legal?: { termsVersion: string; privacyVersion: string }
    ) =>
      request<{ user: UserProfile }>('/api/v1/auth/sync', {
        method: 'POST',
        body: JSON.stringify({
          displayName,
          authProvider,
          inviteCode,
          acceptedTermsVersion: legal?.termsVersion,
          acceptedPrivacyVersion: legal?.privacyVersion,
        }),
      }),
    completeOnboarding: (displayName?: string) =>
      request('/api/v1/auth/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify({ displayName }),
      }),
    completeOAuth: (ticket: string) =>
      request<{
        customToken: string;
        provider: 'discord' | 'twitch' | 'tiktok';
        inviteCode?: string;
        legalAcceptance?: { termsVersion: string; privacyVersion: string };
      }>('/api/v1/auth/oauth/complete', {
        method: 'POST',
        body: JSON.stringify({ ticket }),
      }),
    startOAuthLink: (provider: 'discord' | 'twitch' | 'tiktok') =>
      request<{ url: string }>(`/api/v1/auth/oauth/${provider}/link/start`, {
        method: 'POST',
      }),
    updateProfile: (body: { displayName?: string; locale?: string }) =>
      request<{ user: UserProfile }>('/api/v1/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    updateNexterPreferences: (body: {
      language?: string;
      addressAs?: string;
      voiceCatalogId?: string | null;
      voiceOutputEnabled?: boolean;
      uiTheme?: 'dark' | 'light' | 'system';
      accentPreset?: string;
      customPrimary?: string | null;
      customAccent?: string | null;
      platforms?: string[];
      creationInterests?: string[];
      stylePreferences?: string[];
      creatorGoals?: string[];
      personalizationCompleted?: boolean;
    }) =>
      request<{ user: UserProfile }>('/api/v1/auth/me/nexter-preferences', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    stats: () =>
      request<{ generations: number; projects: number; files: number }>('/api/v1/auth/stats'),
    exportData: () => request<{ export: Record<string, unknown> }>('/api/v1/auth/export'),
    deleteAccount: (confirmation: string) =>
      request<{ disabled: boolean; anonymized: boolean }>('/api/v1/auth/account/delete', {
        method: 'POST',
        body: JSON.stringify({ confirmation }),
      }),
    requestVerificationResend: () =>
      request<{ allowed: boolean }>('/api/v1/auth/email-verification/resend', { method: 'POST' }),
  },
  dna: {
    list: () => request<{ dnas: CreatorDNA[]; active: CreatorDNA | null }>('/api/v1/dna'),
    active: () => request<{ dna: CreatorDNA | null }>('/api/v1/dna/active'),
    create: (body: CreateDnaBody) =>
      request<{ dna: CreatorDNA }>('/api/v1/dna', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (id: string, body: Partial<CreateDnaBody>) =>
      request<{ dna: CreatorDNA }>(`/api/v1/dna/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    analyze: (colors: string[], styleHint?: string, imageDataUrl?: string) =>
      request<{ analysis: DNAAnalysis }>('/api/v1/dna/analyze', {
        method: 'POST',
        body: JSON.stringify({ colors, styleHint, imageDataUrl }),
      }),
    activate: (id: string) =>
      request<{ dna: CreatorDNA }>(`/api/v1/dna/${id}/activate`, { method: 'POST' }),
    versions: (id: string) =>
      request<{ versions: DNAVersion[] }>(`/api/v1/dna/${id}/versions`),
    restore: (id: string, versionId: string) =>
      request<{ dna: CreatorDNA }>(`/api/v1/dna/${id}/versions/${versionId}/restore`, {
        method: 'POST',
      }),
    applyAnalysis: (id: string, body: { colors?: string[]; styleHint?: string; imageDataUrl?: string }) =>
      request<{ dna: CreatorDNA; analysis: DNAAnalysis }>(`/api/v1/dna/${id}/apply-analysis`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    resolve: (projectId?: string) =>
      request<{ dna: CreatorDNA | null; source: 'project' | 'active' | 'none' }>(
        `/api/v1/dna/resolve${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`
      ),
  },
  prompts: {
    list: () =>
      request<{
        sets: {
          id: string;
          title: string;
          purpose: string;
          createdAt: string;
          providers: { provider: string; label: string; prompt: string; notes: string }[];
        }[];
      }>('/api/v1/prompts'),
    generate: (body: { title: string; purpose: string; topic?: string; save?: boolean }) =>
      request<{
        set?: { id: string };
        providers: { provider: string; label: string; prompt: string; notes: string }[];
      }>('/api/v1/prompts/generate', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    delete: (id: string) => request<{ deleted: boolean }>(`/api/v1/prompts/${id}`, { method: 'DELETE' }),
  },
  projects: {
    list: (query?: {
      q?: string;
      type?: string;
      sort?: 'updated' | 'newest' | 'oldest' | 'name';
      filter?: 'active' | 'archived';
      limit?: number;
      offset?: number;
    }) => {
      const qs = new URLSearchParams();
      if (query?.q) qs.set('q', query.q);
      if (query?.type) qs.set('type', query.type);
      if (query?.sort) qs.set('sort', query.sort);
      if (query?.filter) qs.set('filter', query.filter);
      if (query?.limit != null) qs.set('limit', String(query.limit));
      if (query?.offset != null) qs.set('offset', String(query.offset));
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return request<{ projects: import('@ucbs/shared').Project[]; total?: number }>(`/api/v1/projects${suffix}`);
    },
    get: (id: string) => request<{ project: import('@ucbs/shared').Project }>(`/api/v1/projects/${id}`),
    overview: (id: string) =>
      request<{
        project: import('@ucbs/shared').Project;
        dna: { id: string; name: string; version?: number; styleDirection?: string; primaryColors?: string[] } | null;
        assets: Array<{
          id: string;
          name: string;
          type: string;
          url: string;
          version: number;
          createdAt: string;
          jobId?: string;
          fileId?: string;
          module?: string;
          previewUrl?: string;
          downloadable: boolean;
          changeSupported: boolean;
          assetKey?: string;
          expiresAt?: string;
          available?: boolean;
          studioPath?: string;
        }>;
        files: UserFile[];
        videos: Array<{ id: string; title: string; renderUrl?: string; createdAt: string }>;
        shorts: Array<{ id: string; videoUrl?: string; createdAt: string }>;
        content: Array<{ id: string; title: string; createdAt: string }>;
        changeRequests: ChangeRequestRecord[];
        versionsByJob: Record<string, import('@ucbs/shared').DesignVersion[] | { id: string; version: number; imageUrl: string; changeRequest?: string }[]>;
        missing: string[];
        studioPath?: string;
        continuePath?: string;
        activeJobs?: Array<{
          id: string;
          kind: string;
          module: string;
          status: string;
          label: string;
          createdAt: string;
          error?: string;
          fileId?: string;
          href: string;
          progressKnown: false;
        }>;
        failedJobs?: Array<{
          id: string;
          kind: string;
          module: string;
          status: string;
          label: string;
          createdAt: string;
          error?: string;
          href: string;
          progressKnown: false;
        }>;
        completedJobs?: Array<{
          id: string;
          kind: string;
          module: string;
          status: string;
          label: string;
          createdAt: string;
          href: string;
          fileId?: string;
          progressKnown: false;
        }>;
        streamset?: { completed: number; total: number; status: string; href: string } | null;
        activity?: Array<{ id: string; kind: string; title: string; at: string }>;
        errors?: { dna?: string; jobs?: string; files?: string; media?: string };
      }>(`/api/v1/projects/${id}/overview`),
    trash: () => request<{ projects: import('@ucbs/shared').Project[] }>('/api/v1/projects/trash'),
    create: (body: { name: string; description?: string; type: import('@ucbs/shared').ProjectType; dnaId?: string }) =>
      request<{ project: import('@ucbs/shared').Project }>('/api/v1/projects', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    remove: (id: string) =>
      request<{ project: import('@ucbs/shared').Project }>(`/api/v1/projects/${id}`, { method: 'DELETE' }),
    restore: (id: string) =>
      request<{ project: import('@ucbs/shared').Project }>(`/api/v1/projects/${id}/restore`, {
        method: 'POST',
      }),
    purge: (id: string) =>
      request<{ deleted: boolean }>(`/api/v1/projects/${id}/purge`, { method: 'DELETE' }),
    export: (id: string) =>
      request<{
        project: import('@ucbs/shared').Project;
        assets: import('@ucbs/shared').ProjectAsset[];
        exportUrl: string;
        fileCount: number;
        missingCount?: number;
        exportedAt: string;
        manifest?: import('@ucbs/shared').ProjectExportManifest;
      }>(`/api/v1/projects/${id}/export`),
    import: (body: { zipDataUrl: string; importDna?: boolean; importCloud?: boolean }) =>
      request<{
        project: import('@ucbs/shared').Project;
        dnaImported: boolean;
        assetsImported: number;
        cloudFilesImported: number;
        checks: { step: string; ok: boolean; message: string }[];
        importedAt: string;
      }>('/api/v1/projects/import', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    duplicate: (id: string) =>
      request<{ project: import('@ucbs/shared').Project }>(`/api/v1/projects/${id}/duplicate`, {
        method: 'POST',
      }),
    detachAsset: (id: string, assetId: string) =>
      request<{ project: import('@ucbs/shared').Project }>(`/api/v1/projects/${id}/assets/${assetId}`, {
        method: 'DELETE',
      }),
    rename: (id: string, name: string) =>
      request<{ project: import('@ucbs/shared').Project }>(`/api/v1/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      }),
    update: (id: string, body: { name?: string; dnaId?: string; status?: string; type?: string }) =>
      request<{ project: import('@ucbs/shared').Project }>(`/api/v1/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },
  pricing: {
    components: () =>
      request<{
        components: {
          code: string;
          category: string;
          displayName: string;
          description: string;
          priceCents: number;
          pricingVersion: string;
        }[];
      }>('/api/v1/pricing/components'),
    quote: (body: { componentCodes: string[]; quantities?: Record<string, number> }) =>
      request<{
        quoteId: string;
        lineItems: {
          code: string;
          displayName: string;
          quantity: number;
          unitPriceCents: number;
          totalCents: number;
        }[];
        subtotalCents: number;
        discountCents: number;
        totalCents: number;
        currency: string;
        pricingVersion: string;
        expiresAt: string;
      }>('/api/v1/pricing/quote', { method: 'POST', body: JSON.stringify(body) }),
    payWithBalance: (quoteId: string) =>
      request<{ paymentStatus: string; balance: { balanceCents: number } }>(
        '/api/v1/pricing/pay-with-balance',
        { method: 'POST', body: JSON.stringify({ quoteId }) }
      ),
    checkout: (quoteId: string) =>
      request<{ checkoutUrl: string; sessionId: string }>('/api/v1/pricing/checkout', {
        method: 'POST',
        body: JSON.stringify({ quoteId }),
      }),
  },
  balance: {
    get: () =>
      request<{ balance: { balanceCents: number; promotionalCents: number } }>('/api/v1/balance'),
    ledger: () =>
      request<{
        entries: {
          id: string;
          type: string;
          amountCents: number;
          balanceAfterCents: number;
          description: string;
          createdAt: string;
        }[];
      }>('/api/v1/balance/ledger'),
  },
  coins: {
    balance: () => request<{ balance: number }>('/api/v1/coins/balance'),
    packages: () => request<{ packages: CoinPackage[] }>('/api/v1/coins/packages'),
    catalog: () =>
      request<{ catalog: { currency: string; items: CoinCatalogItem[]; freeActions: CoinCatalogItem[] } }>(
        '/api/v1/coins/catalog'
      ),
    quotes: () => request<{ quotes: CoinQuoteSummary[] }>('/api/v1/coins/quotes'),
    transactions: (opts?: { limit?: number; offset?: number }) => {
      const q = new URLSearchParams();
      if (opts?.limit != null) q.set('limit', String(opts.limit));
      if (opts?.offset != null) q.set('offset', String(opts.offset));
      const qs = q.toString();
      return request<{
        transactions: CoinTransaction[];
        total: number;
        limit: number;
        offset: number;
      }>(`/api/v1/coins/transactions${qs ? `?${qs}` : ''}`);
    },
  },
  stripe: {
    checkout: (packageId: string) =>
      request<{ url: string; sessionId: string }>('/api/v1/stripe/checkout', {
        method: 'POST',
        body: JSON.stringify({ packageId }),
      }),
    devPurchase: (packageId: string) =>
      request<{ coinsAdded: number; newBalance: number; message: string }>(
        '/api/v1/stripe/dev-purchase',
        { method: 'POST', body: JSON.stringify({ packageId }) }
      ),
    verifySession: (sessionId: string) =>
      request<{
        credited: boolean;
        duplicate: boolean;
        coinsAdded: number;
        newBalance?: number;
      }>('/api/v1/stripe/verify-session', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      }),
  },
  paypal: {
    checkout: (packageId: string) =>
      request<{ url: string; orderId: string }>('/api/v1/paypal/checkout', {
        method: 'POST',
        body: JSON.stringify({ packageId }),
      }),
    devPurchase: (packageId: string) =>
      request<{ coinsAdded: number; newBalance: number; message: string }>(
        '/api/v1/paypal/dev-purchase',
        { method: 'POST', body: JSON.stringify({ packageId }) }
      ),
    verifyOrder: (orderId: string) =>
      request<{
        credited: boolean;
        duplicate: boolean;
        coinsAdded: number;
        newBalance?: number;
      }>('/api/v1/paypal/verify-order', {
        method: 'POST',
        body: JSON.stringify({ orderId }),
      }),
  },
  ai: {
    generate: (prompt?: string, module = 'ai-image') =>
      request<{ job: GenerationJob; coinsSpent: number; newBalance: number }>(
        '/api/v1/ai/image/generate',
        { method: 'POST', body: JSON.stringify({ prompt, module }) }
      ),
    listJobs: () => request<{ jobs: GenerationJob[] }>('/api/v1/ai/image'),
    getJob: (jobId: string) => request<{ job: GenerationJob }>(`/api/v1/ai/image/${jobId}`),
  },
  studio: {
    list: (module: StudioModuleKey) =>
      request<{ module: string; projects: StudioProjectSummary[] }>(`/api/v1/${module}/`),
    generate: (module: StudioModuleKey, options?: StudioGenerateOptions) =>
      request<GenerateResult>(`/api/v1/${module}/generate`, {
        method: 'POST',
        body: JSON.stringify(options ?? {}),
      }),
    generateBrandingPack: () =>
      request<GenerateResult>('/api/v1/branding/generate-pack', { method: 'POST' }),
    getLogo: (id: string) => request<{ job: GenerationJob }>(`/api/v1/logo/${id}`),
    downloadLogo: (id: string) =>
      request<{ downloadUrl: string; expiresAt: string; fileId: string; filename: string }>(
        `/api/v1/logo/${id}/download`
      ),
    logoVersions: (id: string) =>
      request<{ versions: { id: string; version: number; imageUrl: string }[] }>(`/api/v1/logo/${id}/versions`),
    retryLogo: (id: string) => request<{ ok?: boolean }>(`/api/v1/logo/${id}/retry`, { method: 'POST' }),
    applyLogoDna: (id: string, confirm: boolean) =>
      request<{ dna: unknown }>(`/api/v1/logo/${id}/apply-dna`, {
        method: 'POST',
        body: JSON.stringify({ confirm }),
      }),
    getBanner: (id: string) => request<{ job: GenerationJob }>(`/api/v1/banner/${id}`),
    downloadBanner: (id: string) =>
      request<{ downloadUrl: string; expiresAt: string; fileId: string; filename: string }>(
        `/api/v1/banner/${id}/download`
      ),
    bannerVersions: (id: string) =>
      request<{ versions: { id: string; version: number; imageUrl: string }[] }>(`/api/v1/banner/${id}/versions`),
    retryBanner: (id: string) => request<{ ok?: boolean }>(`/api/v1/banner/${id}/retry`, { method: 'POST' }),
    getFacecam: (id: string) => request<{ job: GenerationJob }>(`/api/v1/facecam/${id}`),
    downloadFacecam: (id: string) =>
      request<{ downloadUrl: string; expiresAt: string; fileId: string; filename: string }>(
        `/api/v1/facecam/${id}/download`
      ),
    facecamVersions: (id: string) =>
      request<{ versions: { id: string; version: number; imageUrl: string }[] }>(`/api/v1/facecam/${id}/versions`),
    retryFacecam: (id: string) => request<{ ok?: boolean }>(`/api/v1/facecam/${id}/retry`, { method: 'POST' }),
    getOverlay: (id: string) => request<{ job: GenerationJob }>(`/api/v1/overlay/${id}`),
    downloadOverlay: (id: string) =>
      request<{ downloadUrl: string; expiresAt: string; fileId: string; filename: string }>(
        `/api/v1/overlay/${id}/download`
      ),
    overlayVersions: (id: string) =>
      request<{ versions: { id: string; version: number; imageUrl: string }[] }>(`/api/v1/overlay/${id}/versions`),
    retryOverlay: (id: string) => request<{ ok?: boolean }>(`/api/v1/overlay/${id}/retry`, { method: 'POST' }),
    getSticker: (id: string) => request<{ job: GenerationJob }>(`/api/v1/sticker/${id}`),
    downloadSticker: (id: string) =>
      request<{ downloadUrl: string; expiresAt: string; fileId: string; filename: string }>(
        `/api/v1/sticker/${id}/download`
      ),
    stickerVersions: (id: string) =>
      request<{ versions: { id: string; version: number; imageUrl: string }[] }>(`/api/v1/sticker/${id}/versions`),
    retrySticker: (id: string) => request<{ ok?: boolean }>(`/api/v1/sticker/${id}/retry`, { method: 'POST' }),
  },
  magik: {
    feedback: (body: {
      eventType: 'download' | 'delete' | 'favorite' | 'regenerate';
      variant?: 'a' | 'b';
      prompt: string;
      profile: Record<string, string | undefined>;
    }) =>
      request<{ recorded: boolean }>('/api/v1/magik/feedback', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  magikAi: {
    getStatus: () =>
      request<import('@ucbs/shared').MagikAiStatusResponse>('/api/v1/magik-ai/status'),
    getSettings: () =>
      request<{
        settings: import('@ucbs/shared').MagikAiSettings;
        defaults: import('@ucbs/shared').MagikAiSettings;
        personalities: import('@ucbs/shared').MagikAiPersonality[];
        locked: boolean;
      }>('/api/v1/magik-ai/settings'),
    updateSettings: (body: Partial<import('@ucbs/shared').MagikAiSettings>) =>
      request<{ settings: import('@ucbs/shared').MagikAiSettings; locked: boolean }>(
        '/api/v1/magik-ai/settings',
        { method: 'PUT', body: JSON.stringify(body) }
      ),
    getLogoContexts: () =>
      request<{ contexts: import('@ucbs/shared').MagikLogoContextRecord[] }>(
        '/api/v1/magik-ai/logo-context'
      ),
    getAvatar: () =>
      request<{ avatar: import('@ucbs/shared').MagikAiAvatar | null }>('/api/v1/magik-ai/avatar'),
    getMemory: () =>
      request<{
        status: import('@ucbs/shared').MagikAiMemoryStatus;
        entries: import('@ucbs/shared').MagikAiMemoryEntry[];
      }>('/api/v1/magik-ai/memory'),
    getRecommendations: () =>
      request<{ items: import('@ucbs/shared').MagikAiRecommendation[] }>(
        '/api/v1/magik-ai/recommendations'
      ),
    getConversation: () =>
      request<{ session: import('@ucbs/shared').MagikAiConversationSession | null }>(
        '/api/v1/magik-ai/conversation'
      ),
  },
  ccd: {
    getDashboard: () =>
      request<{
        character: import('@ucbs/shared').CharacterDNA | null;
        preferences: import('@ucbs/shared').CreatorPreferencesDNA | null;
        pendingEvolutions: import('@ucbs/shared').CharacterEvolutionProposal[];
        recommendations: import('@ucbs/shared').CcdRecommendation[];
      }>('/api/v1/ccd'),
    getContext: () =>
      request<{
        characterDna: import('@ucbs/shared').CharacterDNA | null;
        creatorPreferences: import('@ucbs/shared').CreatorPreferencesDNA | null;
      }>('/api/v1/ccd/context'),
    acceptEvolution: (id: string) =>
      request<{ character: import('@ucbs/shared').CharacterDNA; proposal: import('@ucbs/shared').CharacterEvolutionProposal }>(
        `/api/v1/ccd/evolution/${id}/accept`,
        { method: 'POST' }
      ),
    rejectEvolution: (id: string) =>
      request<{ proposal: import('@ucbs/shared').CharacterEvolutionProposal }>(
        `/api/v1/ccd/evolution/${id}/reject`,
        { method: 'POST' }
      ),
  },
  ultimateCreator: {
    listProjects: () =>
      request<{ projects: import('@ucbs/shared').UltimateCreatorProject[] }>(
        '/api/v1/ultimate-creator/projects'
      ).then((r) => r.projects),
    getProject: (id: string) =>
      request<{ project: import('@ucbs/shared').UltimateCreatorProject }>(
        `/api/v1/ultimate-creator/projects/${id}`
      ).then((r) => r.project),
    create: (body: import('@ucbs/shared').UltimateCreatorWizardInput) =>
      request<{
        project: import('@ucbs/shared').UltimateCreatorProject;
        coinsSpent: number;
        newBalance: number;
      }>('/api/v1/ultimate-creator/create', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    exportProject: (id: string, platform = 'all') =>
      request<{ project: import('@ucbs/shared').UltimateCreatorProject }>(
        `/api/v1/ultimate-creator/projects/${id}/export`,
        { method: 'POST', body: JSON.stringify({ platform }) }
      ),
  },
  files: {
    list: (query?: string | {
      projectId?: string;
      q?: string;
      category?: string;
      kind?: string;
      source?: string;
      sort?: string;
      limit?: number;
      offset?: number;
    }) => {
      const params = new URLSearchParams();
      if (typeof query === 'string' && query) params.set('projectId', query);
      else if (query && typeof query === 'object') {
        if (query.projectId) params.set('projectId', query.projectId);
        if (query.q) params.set('q', query.q);
        if (query.category) params.set('category', query.category);
        if (query.kind) params.set('kind', query.kind);
        if (query.source) params.set('source', query.source);
        if (query.sort) params.set('sort', query.sort);
        if (query.limit != null) params.set('limit', String(query.limit));
        if (query.offset != null) params.set('offset', String(query.offset));
      }
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request<{
        files: UserFile[];
        total?: number;
        counts?: { total: number; image: number; video: number; audio: number };
        limit?: number;
        offset?: number;
      }>(`/api/v1/files${suffix}`);
    },
    get: (id: string) =>
      request<{
        file: UserFile & { dataUrl?: string };
        expiresAt?: string;
        expiresInMs?: number;
        usage?: Array<{ projectId: string; projectName: string; assetId: string }>;
        versions?: UserFile[];
        references?: string[];
      }>(`/api/v1/files/${id}`),
    downloadUrl: (id: string) =>
      request<{ downloadUrl: string; expiresAt: string; expiresInMs: number }>(
        `/api/v1/files/${id}/download-url`
      ),
    upload: (body: {
      name: string;
      mimeType: string;
      category: UserFile['category'];
      dataUrl: string;
      projectId?: string;
      rightsConfirmed: true;
    }) =>
      request<{ file: UserFile }>('/api/v1/files', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: { name?: string; projectId?: string | null }) =>
      request<{ file: UserFile }>(`/api/v1/files/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => request<{ deleted: boolean }>(`/api/v1/files/${id}`, { method: 'DELETE' }),
  },
  layout: {
    list: () => request<{ layouts: StreamLayout[] }>('/api/v1/layout'),
    get: (id: string) => request<{ layout: StreamLayout }>(`/api/v1/layout/${id}`),
    create: (body: Partial<StreamLayout>) =>
      request<{ layout: StreamLayout }>('/api/v1/layout', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<StreamLayout>) =>
      request<{ layout: StreamLayout }>(`/api/v1/layout/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    export: (id: string, format: 'obs' | 'streamlabs' | 'json') =>
      request<{ export: string; format: string }>(`/api/v1/layout/${id}/export`, {
        method: 'POST',
        body: JSON.stringify({ format }),
      }),
    exportFile: (id: string) =>
      request<{ fileId: string; downloadUrl: string; filename: string }>(`/api/v1/layout/${id}/export-file`, {
        method: 'POST',
      }),
    duplicate: (id: string) =>
      request<{ layout: StreamLayout }>(`/api/v1/layout/${id}/duplicate`, { method: 'POST' }),
    delete: (id: string) => request<{ deleted: boolean }>(`/api/v1/layout/${id}`, { method: 'DELETE' }),
  },
  changeRequest: {
    list: () =>
      request<{
        changeRequests: ChangeRequestRecord[];
        availableJobs: GenerationJob[];
        sources?: ChangeableSource[];
      }>('/api/v1/change-request'),
    quote: (
      jobIdOrInput: string | {
        jobId?: string;
        fileId?: string;
        projectAssetId?: string;
        request: string;
        projectId?: string;
        scope?: 'asset' | 'set' | 'dna';
      },
      requestText?: string,
      projectId?: string
    ) => {
      const body =
        typeof jobIdOrInput === 'string'
          ? { jobId: jobIdOrInput, request: requestText, projectId }
          : jobIdOrInput;
      return request<{
        quote: { id: string; kind: string; coinCost: number; status: string };
        module: string;
        honestLabel: string;
        source?: ChangeableSource;
      }>('/api/v1/change-request/quote', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    create: (jobId: string, requestText: string) =>
      request<{ changeRequest: ChangeRequestRecord }>('/api/v1/change-request', {
        method: 'POST',
        body: JSON.stringify({ jobId, request: requestText }),
      }),
    versions: (jobId: string) =>
      request<{ versions: DesignVersion[] }>(`/api/v1/change-request/job/${jobId}/versions`),
    compare: (id: string) =>
      request<{ comparison: { before?: string; after?: string; request: string; status: string } }>(
        `/api/v1/change-request/${id}/compare`
      ),
    restore: (versionId: string) =>
      request<{ version: DesignVersion }>(`/api/v1/change-request/restore/${versionId}`, { method: 'POST' }),
  },
  assistant: {
    getSession: () => request<{ session: AssistantSession }>('/api/v1/assistant/session'),
    chat: (message: string) =>
      request<{ session: AssistantSession }>('/api/v1/assistant/chat', {
        method: 'POST',
        body: JSON.stringify({ message }),
      }),
    clearSession: () => request('/api/v1/assistant/session', { method: 'DELETE' }),
  },
  nexter: {
    getSession: () => request<{ session: NexterSessionDto }>('/api/v1/nexter/session'),
    newSession: () =>
      request<{ session: NexterSessionDto }>('/api/v1/nexter/session', { method: 'POST' }),
    chat: (message: string, meta?: { path?: string; hint?: string; projectId?: string; fileId?: string }) =>
      request<{ session: NexterSessionDto }>('/api/v1/nexter/chat', {
        method: 'POST',
        body: JSON.stringify({ message, ...meta }),
      }),
    confirmQuote: (quoteId: string) =>
      request<{
        quote: { id: string; kind: string; coinCost: number; status: string };
        coinsSpent: number;
        newBalance: number;
        jobIds: string[];
        session: NexterSessionDto;
      }>(`/api/v1/nexter/quotes/${quoteId}/confirm`, { method: 'POST' }),
    cancelQuote: (quoteId: string) =>
      request<{ quote: { id: string; status: string }; session: NexterSessionDto }>(
        `/api/v1/nexter/quotes/${quoteId}/cancel`,
        { method: 'POST' }
      ),
    listen: (audioBase64: string, mimeType?: string) =>
      request<{ transcript: string }>('/api/v1/nexter/listen', {
        method: 'POST',
        body: JSON.stringify({ audioBase64, mimeType }),
      }),
    speak: (text: string) =>
      request<{ audioUrl: string; provider: string }>('/api/v1/nexter/speak', {
        method: 'POST',
        body: JSON.stringify({ text }),
      }),
    voices: () =>
      request<{ voices: import('@ucbs/shared').NexterVoiceCatalogEntry[] }>('/api/v1/nexter/voices'),
    voicePreview: async (catalogId: string) => {
      const token = await getToken();
      let res: Response;
      try {
        res = await fetch(`${API_URL}/api/v1/nexter/voices/${encodeURIComponent(catalogId)}/preview`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
      } catch {
        throw new ApiError('Server nicht erreichbar. Bitte kurz warten und erneut versuchen.', 'NETWORK_ERROR', 0);
      }
      if (!res.ok) {
        throw new ApiError('Keine Stimmvorschau verfügbar', 'PREVIEW_UNAVAILABLE', res.status);
      }
      return res.blob();
    },
    context: () => request<{ context: import('@ucbs/shared').NexterContextSnapshot }>('/api/v1/nexter/context'),
    clearSession: () => request('/api/v1/nexter/session', { method: 'DELETE' }),
  },
  mockups: {
    list: () => request<{ jobs: import('@ucbs/shared').MockupJob[] }>('/api/v1/mockups'),
    generate: (body: import('@ucbs/shared').MockupGenerateInput) =>
      request<{ job: import('@ucbs/shared').MockupJob }>('/api/v1/mockups', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    get: (id: string) => request<{ job: import('@ucbs/shared').MockupJob }>(`/api/v1/mockups/${id}`),
    download: (id: string) =>
      request<{ downloadUrl: string; expiresAt: string; fileId: string; filename: string }>(
        `/api/v1/mockups/${id}/download`
      ),
    versions: (id: string) =>
      request<{ versions: { id: string; version: number; imageUrl: string }[] }>(`/api/v1/mockups/${id}/versions`),
    retry: (id: string) => request<{ ok?: boolean }>(`/api/v1/mockups/${id}/retry`, { method: 'POST' }),
    saveFile: (id: string) =>
      request<{ file: UserFile }>(`/api/v1/mockups/${id}/save-file`, { method: 'POST' }),
    saveProject: (id: string, projectId: string) =>
      request<{ project: import('@ucbs/shared').Project; asset: import('@ucbs/shared').ProjectAsset }>(
        `/api/v1/mockups/${id}/save-project`,
        { method: 'POST', body: JSON.stringify({ projectId }) }
      ),
  },
  streamset: {
    status: (projectId?: string) =>
      request<StreamsetStatus>(
        `/api/v1/streamset/status${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`
      ),
    pack: (projectId?: string) =>
      request<{ jobs: GenerationJob[]; coinsSpent: number; newBalance: number }>('/api/v1/streamset/pack', {
        method: 'POST',
        body: JSON.stringify(projectId ? { projectId } : {}),
      }),
    asset: (input: { assetKey?: string; kind?: 'overlay' | 'banner' | 'facecam' | 'sticker'; projectId?: string }) =>
      request<{ job: GenerationJob; coinsSpent: number; newBalance: number }>('/api/v1/streamset/asset', {
        method: 'POST',
        body: JSON.stringify(typeof input === 'string' ? { kind: input } : input),
      }),
    exportZip: (projectId?: string) =>
      request<{
        exportUrl: string;
        files: number;
        missing: string[];
        exportedAt: string;
        incomplete?: boolean;
        fileName?: string;
        completeLabel?: string;
      }>(
        `/api/v1/streamset/export${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`
      ),
    preview: (body: {
      projectId?: string;
      platform?: 'twitch' | 'tiktok' | 'youtube' | 'discord';
      selectedKeys?: string[];
      selectedSlotIds?: string[];
      sourceLogoJobId?: string;
      creatorName?: string;
      includeCreatorName?: boolean;
    }) =>
      request<StreamsetDraft>('/api/v1/streamset/preview', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    quote: (body: {
      draftId?: string;
      projectId?: string;
      platform?: 'twitch' | 'tiktok' | 'youtube' | 'discord';
      selectedKeys?: string[];
      selectedSlotIds?: string[];
      sourceLogoJobId?: string;
      creatorName?: string;
      includeCreatorName?: boolean;
    }) =>
      request<{ quote: { id: string; coinCost: number; status: string; kind: string }; generated: boolean; charged: boolean }>(
        '/api/v1/streamset/quote',
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      ),
    confirm: (quoteId: string) =>
      request<{
        quote: { id: string; coinCost: number; status: string; kind: string };
        batch?: GenerationJob;
        jobs: GenerationJob[];
        coinsSpent: number;
        refundedCoins: number;
        newBalance: number;
        batchStatus: string;
        generated: boolean;
        charged: boolean;
      }>(`/api/v1/streamset/quotes/${encodeURIComponent(quoteId)}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ confirm: true }),
      }),
    retry: (body: { batchId: string; assetKey: string; variant?: boolean }) =>
      request<{
        started?: boolean;
        charged?: boolean;
        inFlight?: boolean;
        requiresQuote?: boolean;
        policy?: string;
        job?: GenerationJob;
        quote?: { id: string; coinCost: number; status: string };
        coinCost?: number;
        message?: string;
      }>('/api/v1/streamset/retry', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  textStudio: {
    list: () => request<{ jobs: TextStudioJob[] }>('/api/v1/text'),
    get: (id: string) => request<{ job: TextStudioJob }>(`/api/v1/text/${id}`),
    quote: (body: {
      kind?: string;
      topic?: string;
      projectId?: string;
      sourceType?: string;
      sourceAssetId?: string;
      videoProjectId?: string;
      shortJobId?: string;
      highlightIndex?: number;
      fileId?: string;
      platforms?: string[];
      packageId?: string;
      revisionField?: string;
      revisionInstruction?: string;
      variantCount?: number;
      wantLastShort?: boolean;
      wantLastLogo?: boolean;
      tone?: string;
      goal?: string;
      language?: string;
    }) =>
      request<{ quote: { id: string; kind: string; coinCost: number; status: string } }>('/api/v1/text/quote', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (id: string, body: Partial<TextStudioJob>) =>
      request<{ job: TextStudioJob }>(`/api/v1/text/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    export: (id: string) => request<{ filename: string; text: string; mimeType: string }>(`/api/v1/text/${id}/export`),
    restoreRevision: (id: string, revisionIndex: number) =>
      request<{ job: TextStudioJob }>(`/api/v1/text/${id}/restore-revision`, {
        method: 'POST',
        body: JSON.stringify({ revisionIndex }),
      }),
    draft: (body: {
      kind?: string;
      topic?: string;
      projectId?: string;
      sourceType?: string;
      sourceAssetId?: string;
      videoProjectId?: string;
      shortJobId?: string;
    }) =>
      request<{ job: TextStudioJob }>('/api/v1/text/draft', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  socialStudio: {
    quote: (format: 'thumbnail' | 'post' | 'story' | 'announcement', projectId?: string) =>
      request<{ quote: { id: string; kind: string; coinCost: number; status: string } }>('/api/v1/social-studio/quote', {
        method: 'POST',
        body: JSON.stringify({ format, projectId }),
      }),
  },
  feedback: {
    submit: (body: {
      module?: string;
      message: string;
      category?: string;
      type?: string;
      subject?: string;
      route?: string;
      projectId?: string;
      jobId?: string;
      fileId?: string;
      requestId?: string;
      idempotencyKey?: string;
      screenshotDataUrl?: string;
    }) =>
      request<{ feedback: TesterFeedbackRow }>('/api/v1/feedback', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    list: (query?: { limit?: number; offset?: number }) => {
      const params = new URLSearchParams();
      if (query?.limit != null) params.set('limit', String(query.limit));
      if (query?.offset != null) params.set('offset', String(query.offset));
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request<{
        feedback: TesterFeedbackRow[];
        total: number;
        limit: number;
        offset: number;
        hasMore: boolean;
      }>(`/api/v1/feedback${suffix}`);
    },
    get: (id: string) => request<{ feedback: TesterFeedbackRow }>(`/api/v1/feedback/${id}`),
  },
  legal: {
    page: (slug: 'impressum' | 'datenschutz' | 'agb' | 'widerruf' | 'cookies') =>
      request<{
        title: string;
        html: string;
        draft?: boolean;
        notice?: string;
        status?: string;
        publicationStatus?: 'draft' | 'incomplete' | 'published';
        documentVersion?: string;
        lastUpdated?: string;
        seoTitle?: string;
        seoDescription?: string;
        blocks?: Array<
          | { type: 'p'; text: string }
          | { type: 'h2'; text: string }
          | { type: 'h3'; text: string }
          | { type: 'ul'; items: string[] }
          | { type: 'note'; text: string }
          | { type: 'links'; items: { href: string; label: string }[] }
        >;
      }>(`/api/v1/legal/${slug}`),
  },
  admin: {
    analytics: () => request<{ analytics: AdminAnalytics }>('/api/v1/admin/analytics'),
    overview: () =>
      request<{ analytics: AdminAnalytics; system: AdminSystemStatus }>('/api/v1/admin/overview'),
    users: (q?: string, limit = 25, offset = 0) => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      return request<{
        users: AdminUserSummary[];
        total: number;
        limit: number;
        offset: number;
        hasMore: boolean;
      }>(`/api/v1/admin/users?${params.toString()}`);
    },
    setRole: (userId: string, role: string, reason: string, confirm: true) =>
      request(`/api/v1/admin/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role, reason, confirm }),
      }),
    disable: (userId: string, disabled: boolean, reason: string, confirm: true) =>
      request(`/api/v1/admin/users/${userId}/disable`, {
        method: 'POST',
        body: JSON.stringify({ disabled, reason, confirm }),
      }),
    coins: (userId: string, amount: number, reason: string, confirm: true, idempotencyKey?: string) =>
      request(`/api/v1/admin/users/${userId}/coins`, {
        method: 'POST',
        body: JSON.stringify({ amount, reason, confirm, idempotencyKey }),
      }),
    user: (userId: string) =>
      request<{
        user: AdminUserSummary;
        transactions: Array<{ id: string; type: string; amount: number; description: string; createdAt?: string }>;
        jobs: Array<{
          id: string;
          userId: string;
          module?: string;
          status: string;
          errorCode?: string;
          createdAt: string;
          assetKey?: string;
          parentJobId?: string;
          batchId?: string;
          refunded?: boolean;
        }>;
        audit: unknown[];
        projects: Array<{ id: string; name: string; type?: string; createdAt?: string }>;
        files: Array<{ id: string; name: string; mimeType?: string; size?: number; category?: string; createdAt?: string }>;
        nexterSessionCount: number;
      }>(`/api/v1/admin/users/${userId}`),
    audit: () => request<{ audit: Array<{ id: string; actorUserId: string; action: string; targetUserId?: string; reason?: string; createdAt: string }> }>('/api/v1/admin/audit'),
    payments: () =>
      request<{ stripe: Array<{ id: string; provider: string; status: string; packageId?: string; error?: string }>; paypal: Array<{ id: string; provider: string; status: string; packageId?: string; error?: string }> }>(
        '/api/v1/admin/payments'
      ),
    recoverJobs: () => request<{ recovery: unknown }>('/api/v1/admin/jobs/recover', { method: 'POST' }),
    jobs: (status?: string) =>
      request<{
        jobs: Array<{
          id: string;
          userId: string;
          module?: string;
          status: string;
          errorCode?: string;
          createdAt: string;
          assetKey?: string;
          parentJobId?: string;
          batchId?: string;
          refunded?: boolean;
        }>;
      }>(
        `/api/v1/admin/jobs${status ? `?status=${encodeURIComponent(status)}` : ''}`
      ),
    settings: () => request<{ settings: AdminSystemStatus['settings'] }>('/api/v1/admin/settings'),
    updateSettings: (body: {
      registrationMode?: 'closed' | 'invite_only' | 'public';
      generationsEnabled?: boolean;
      imageGenerationsEnabled?: boolean;
      videoGenerationsEnabled?: boolean;
      paymentsEnabled?: boolean;
    }) =>
      request<{ settings: AdminSystemStatus['settings'] }>('/api/v1/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    invites: () =>
      request<{
        invites: Array<{
          id: string;
          code: string;
          description: string;
          assignedEmail?: string;
          maximumUses: number;
          currentUses: number;
          expiresAt?: string;
          isActive: boolean;
          grantRole?: string;
          createdAt: string;
          email?: { status: string; sent: boolean };
        }>;
      }>('/api/v1/admin/invites'),
    createInvite: (body: {
      description: string;
      assignedEmail?: string;
      maximumUses?: number;
      grantRole?: 'user' | 'tester';
    }) =>
      request<{
        invite: { id: string; code: string };
        email?: { attempted: boolean; sent: boolean; duplicate: boolean; status: string; message: string };
      }>('/api/v1/admin/invites', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    resendInviteEmail: (id: string) =>
      request<{
        invite: { id: string };
        email: { attempted: boolean; sent: boolean; duplicate: boolean; status: string; message: string };
      }>(`/api/v1/admin/invites/${id}/resend-email`, { method: 'POST' }),
    deactivateInvite: (id: string) =>
      request(`/api/v1/admin/invites/${id}/deactivate`, { method: 'POST' }),
    feedback: (query?: { status?: string; type?: string; category?: string; limit?: number; offset?: number }) => {
      const params = new URLSearchParams();
      if (query?.status) params.set('status', query.status);
      if (query?.type) params.set('type', query.type);
      if (query?.category) params.set('category', query.category);
      if (query?.limit != null) params.set('limit', String(query.limit));
      if (query?.offset != null) params.set('offset', String(query.offset));
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request<{
        feedback: TesterFeedbackRow[];
        total?: number;
        limit?: number;
        offset?: number;
        hasMore?: boolean;
      }>(`/api/v1/admin/feedback${suffix}`);
    },
    getFeedback: (id: string) => request<{ feedback: TesterFeedbackRow }>(`/api/v1/admin/feedback/${id}`),
    updateFeedback: (id: string, status: string) =>
      request<{ feedback: TesterFeedbackRow }>(`/api/v1/admin/feedback/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    testerGrant: (userId: string, reason: string, confirm: true) =>
      request<{ granted: number; duplicate: boolean; newBalance: number; alreadyGranted: boolean; message: string }>(
        `/api/v1/admin/users/${userId}/tester-grant`,
        { method: 'POST', body: JSON.stringify({ reason, confirm }) }
      ),
  },
  team: {
    list: () => request<{ teams: Team[] }>('/api/v1/team'),
    get: (id: string) => request<{ team: Team; members: TeamMember[]; dna: CreatorDNA | null }>(`/api/v1/team/${id}`),
    create: (body: { name: string; type: string; description?: string }) =>
      request<{ team: Team }>('/api/v1/team', { method: 'POST', body: JSON.stringify(body) }),
    createDna: (teamId: string, baseDnaId?: string) =>
      request<{ team: Team; dna: CreatorDNA }>(`/api/v1/team/${teamId}/dna`, {
        method: 'POST',
        body: JSON.stringify({ baseDnaId }),
      }),
  },
  agency: {
    list: () => request<{ agencies: Agency[] }>('/api/v1/agency'),
    get: (id: string) => request<{ agency: Agency; members: AgencyMember[]; dna: CreatorDNA | null }>(`/api/v1/agency/${id}`),
    create: (body: { name: string; description?: string }) =>
      request<{ agency: Agency }>('/api/v1/agency', { method: 'POST', body: JSON.stringify(body) }),
    createDna: (agencyId: string, baseDnaId?: string) =>
      request<{ agency: Agency; dna: CreatorDNA }>(`/api/v1/agency/${agencyId}/dna`, {
        method: 'POST',
        body: JSON.stringify({ baseDnaId }),
      }),
  },
  video: {
    list: () => request<{ projects: VideoProject[]; jobs: MediaJob[] }>('/api/v1/video'),
    get: (id: string) => request<{ project: VideoProject }>(`/api/v1/video/${id}`),
    create: (title: string, duration?: number, format?: string, brandProjectId?: string) =>
      request<{ project: VideoProject }>('/api/v1/video', {
        method: 'POST',
        body: JSON.stringify({ title, duration, format, brandProjectId }),
      }),
    detectHighlights: (id: string) =>
      request<{ project: VideoProject }>(`/api/v1/video/${id}/highlights`, { method: 'POST' }),
    generateSubtitles: (id: string) =>
      request<{ project: VideoProject }>(`/api/v1/video/${id}/subtitles`, { method: 'POST' }),
    createShort: (
      id: string,
      body: {
        highlightIndex?: number;
        start?: number;
        end?: number;
        format?: string;
        crop?: VideoCrop;
        fitMode?: 'crop' | 'fit' | 'center';
        burnSubtitles?: boolean;
      }
    ) =>
      request<{ job: MediaJob; coinsSpent: number; newBalance?: number }>(`/api/v1/video/${id}/shorts`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    uploadSource: (id: string, dataUrl: string, duration?: number, fileName?: string) =>
      request<{ project: VideoProject }>(`/api/v1/video/${id}/source`, {
        method: 'POST',
        body: JSON.stringify({ dataUrl, duration, fileName, rightsConfirmed: true as const }),
      }),
    render: (id: string) =>
      request<{ project: VideoProject }>(`/api/v1/video/${id}/render`, { method: 'POST' }),
    saveEditPlan: (id: string, plan: VideoEditPlan) =>
      request<{ project: VideoProject }>(`/api/v1/video/${id}/edit-plan`, {
        method: 'PATCH',
        body: JSON.stringify(plan),
      }),
    analyzeLocal: (id: string) =>
      request<{ project: VideoProject }>(`/api/v1/video/${id}/analyze-local`, { method: 'POST' }),
    patchSubtitles: (id: string, subtitles: SubtitleEntry[]) =>
      request<{ project: VideoProject }>(`/api/v1/video/${id}/subtitles`, {
        method: 'PATCH',
        body: JSON.stringify({ subtitles }),
      }),
    saveProject: (id: string, projectId: string) =>
      request<{ project: { id: string }; asset: { id: string } }>(`/api/v1/video/${id}/save-project`, {
        method: 'POST',
        body: JSON.stringify({ projectId }),
      }),
    saveFile: (id: string, jobId?: string) =>
      request<{ file: UserFile }>(
        jobId ? `/api/v1/video/${id}/shorts/${jobId}/save-file` : `/api/v1/video/${id}/save-file`,
        { method: 'POST' }
      ),
  },
  introOutro: {
    list: () => request<{ jobs: MediaJob[] }>('/api/v1/intro-outro'),
    generate: (type: IntroOutroType, prompt?: string, title?: string) =>
      request<{ job: MediaJob; coinsSpent: number; newBalance: number }>('/api/v1/intro-outro/generate', {
        method: 'POST',
        body: JSON.stringify({ type, prompt, title }),
      }),
    generatePack: () =>
      request<{ jobs: MediaJob[]; coinsSpent: number; newBalance: number }>('/api/v1/intro-outro/generate-pack', {
        method: 'POST',
      }),
  },
  animations: {
    list: () => request<{ jobs: MediaJob[] }>('/api/v1/animations'),
    assets: () => request<{ files: UserFile[] }>('/api/v1/animations/assets'),
    get: (id: string) => request<{ job: MediaJob }>(`/api/v1/animations/${id}`),
    download: (id: string) =>
      request<{ downloadUrl: string; expiresAt: string; fileId: string }>(`/api/v1/animations/${id}/download`),
    versions: (id: string) =>
      request<{ versions: { id: string; version: number; imageUrl: string }[] }>(`/api/v1/animations/${id}/versions`),
  },
  vtuber: {
    list: () => request<{ characters: MediaJob[] }>('/api/v1/vtuber'),
    get: (id: string) => request<{ job: MediaJob }>(`/api/v1/vtuber/${id}`),
    generate: (type?: VTuberType, prompt?: string, title?: string) =>
      request<{ job: MediaJob; coinsSpent: number; newBalance: number }>('/api/v1/vtuber/generate', {
        method: 'POST',
        body: JSON.stringify({ type, prompt, title }),
      }),
    generatePack: () =>
      request<{ jobs: MediaJob[]; coinsSpent: number; newBalance: number }>('/api/v1/vtuber/generate-pack', {
        method: 'POST',
      }),
  },
  aiVideo: {
    list: () => request<{ jobs: MediaJob[] }>('/api/v1/ai/video'),
    generate: (prompt?: string, title?: string, duration?: number) =>
      request<{ job: MediaJob; coinsSpent: number; newBalance: number }>('/api/v1/ai/video/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt, title, duration }),
      }),
    getJob: (id: string) => request<{ job: MediaJob }>(`/api/v1/ai/video/${id}`),
  },
  aiMusic: {
    list: () => request<{ jobs: MediaJob[] }>('/api/v1/ai/music'),
    assets: () => request<{ files: UserFile[] }>('/api/v1/ai/music/assets'),
    generate: (prompt?: string, title?: string, duration?: number) =>
      request<{ job: MediaJob; coinsSpent: number; newBalance: number }>('/api/v1/ai/music/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt, title, duration }),
      }),
    getJob: (id: string) => request<{ job: MediaJob }>(`/api/v1/ai/music/${id}`),
    download: (id: string) =>
      request<{ downloadUrl: string; expiresAt: string; fileId: string; filename: string }>(
        `/api/v1/ai/music/${id}/download`
      ),
    versions: (id: string) =>
      request<{ versions: { id: string; version: number; imageUrl: string }[] }>(`/api/v1/ai/music/${id}/versions`),
    retry: (id: string) => request<{ ok?: boolean }>(`/api/v1/ai/music/${id}/retry`, { method: 'POST' }),
  },
  aiVoice: {
    list: () => request<{ jobs: MediaJob[] }>('/api/v1/ai/voice'),
    generate: (prompt?: string, title?: string) =>
      request<{ job: MediaJob; coinsSpent: number; newBalance: number }>('/api/v1/ai/voice/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt, title }),
      }),
    getJob: (id: string) => request<{ job: MediaJob }>(`/api/v1/ai/voice/${id}`),
    download: (id: string) =>
      request<{ downloadUrl: string; expiresAt: string; fileId: string; filename: string }>(
        `/api/v1/ai/voice/${id}/download`
      ),
    versions: (id: string) =>
      request<{ versions: { id: string; version: number; imageUrl: string }[] }>(`/api/v1/ai/voice/${id}/versions`),
    retry: (id: string) => request<{ ok?: boolean }>(`/api/v1/ai/voice/${id}/retry`, { method: 'POST' }),
  },
  marketplace: {
    list: (category?: string) =>
      request<{ items: MarketplaceItem[]; purchases: MarketplacePurchase[]; purchasedIds: string[] }>(
        `/api/v1/marketplace${category ? `?category=${category}` : ''}`
      ),
    purchases: () =>
      request<{ purchases: MarketplacePurchase[]; items: MarketplaceItem[] }>('/api/v1/marketplace/purchases'),
    myListings: () =>
      request<{ items: MarketplaceItem[] }>('/api/v1/marketplace/my-listings'),
    createListing: (body: CreateListingBody) =>
      request<{ item: MarketplaceItem }>('/api/v1/marketplace/listings', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    deactivateListing: (id: string) =>
      request<{ item: MarketplaceItem }>(`/api/v1/marketplace/listings/${id}`, {
        method: 'DELETE',
      }),
    purchase: (id: string) =>
      request<{ purchase: MarketplacePurchase; item: MarketplaceItem; newBalance: number }>(
        `/api/v1/marketplace/${id}/purchase`,
        { method: 'POST' }
      ),
    download: (id: string) =>
      request<{ downloadUrl: string }>(`/api/v1/marketplace/${id}/download`),
  },
  social: {
    list: () => request<{ posts: SocialPost[]; stats: SocialStats }>('/api/v1/social'),
    create: (body: {
      platform: SocialPlatform;
      content: string;
      scheduledAt?: string;
      mediaDataUrl?: string;
      mediaAssetId?: string;
      mediaKind?: string;
      packageId?: string;
      projectId?: string;
      status?: string;
      contentType?: string;
    }) =>
      request<{ post: SocialPost }>('/api/v1/social', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<SocialPost> & { clearSchedule?: boolean }) =>
      request<{ post: SocialPost }>(`/api/v1/social/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => request(`/api/v1/social/${id}`, { method: 'DELETE' }),
  },
  calendar: {
    list: (query?: {
      platform?: string;
      contentType?: string;
      status?: string;
      q?: string;
      from?: string;
      to?: string;
    }) => {
      const qs = new URLSearchParams();
      if (query?.platform) qs.set('platform', query.platform);
      if (query?.contentType) qs.set('contentType', query.contentType);
      if (query?.status) qs.set('status', query.status);
      if (query?.q) qs.set('q', query.q);
      if (query?.from) qs.set('from', query.from);
      if (query?.to) qs.set('to', query.to);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return request<{
        events: CalendarEvent[];
        upcoming: CalendarEvent[];
        items?: PlanningItemDto[];
        today?: PlanningItemDto[];
        upcomingItems?: PlanningItemDto[];
        publishingAvailable?: boolean;
      }>(`/api/v1/calendar${suffix}`);
    },
    create: (body: CreateCalendarEventBody) =>
      request<{ event: CalendarEvent }>('/api/v1/calendar', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<CalendarEvent>) =>
      request<{ event: CalendarEvent }>(`/api/v1/calendar/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => request(`/api/v1/calendar/${id}`, { method: 'DELETE' }),
  },
  chat: {
    getSession: () => request<{ channel: ChatChannel; messages: TeamChatMessage[] }>('/api/v1/chat'),
    send: (content: string, channelId?: string) =>
      request<{ message: TeamChatMessage }>('/api/v1/chat/messages', {
        method: 'POST',
        body: JSON.stringify({ content, channelId }),
      }),
  },
  agencyManagement: {
    overview: () =>
      request<AgencyManagementOverview>('/api/v1/agency-management'),
    createClient: (body: CreateAgencyClientBody) =>
      request<{ client: AgencyClientRecord }>('/api/v1/agency-management/clients', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    createProject: (body: CreateAgencyProjectBody) =>
      request<{ project: ClientProjectRecord }>('/api/v1/agency-management/projects', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    updateProjectStatus: (id: string, agencyId: string, status: ClientProjectRecord['status']) =>
      request<{ project: ClientProjectRecord }>(`/api/v1/agency-management/projects/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ agencyId, status }),
      }),
  },
  clientPortal: {
    list: () => request<{ projects: ClientProjectRecord[] }>('/api/v1/client'),
    get: (id: string) => request<{ project: ClientProjectRecord }>(`/api/v1/client/projects/${id}`),
    feedback: (id: string, message: string) =>
      request<{ project: ClientProjectRecord }>(`/api/v1/client/projects/${id}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      }),
  },
  whiteLabel: {
    get: () => request<{ config: WhiteLabelConfig; preview: WhiteLabelPreview }>('/api/v1/white-label'),
    update: (body: Partial<WhiteLabelConfig>) =>
      request<{ config: WhiteLabelConfig; preview: WhiteLabelPreview }>('/api/v1/white-label', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },
  mobile: {
    get: () => request<MobileAppOverview>('/api/v1/mobile'),
    update: (body: Partial<MobileAppConfig>) =>
      request<{ config: MobileAppConfig; manifest: Record<string, unknown> }>('/api/v1/mobile', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    registerDevice: (platform: MobileDevice['platform'], deviceName: string) =>
      request<{ device: MobileDevice }>('/api/v1/mobile/devices', {
        method: 'POST',
        body: JSON.stringify({ platform, deviceName }),
      }),
  },
  liveStream: {
    get: () => request<LiveStreamOverview>('/api/v1/live-stream'),
    updateConfig: (body: Partial<LiveStreamConfig>) =>
      request<{ config: LiveStreamConfig }>('/api/v1/live-stream/config', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    regenerateKey: () =>
      request<{ config: LiveStreamConfig }>('/api/v1/live-stream/config/regenerate-key', { method: 'POST' }),
    createSession: (title: string, platforms?: StreamPlatform[]) =>
      request<{ session: LiveStreamSession }>('/api/v1/live-stream/sessions', {
        method: 'POST',
        body: JSON.stringify({ title, platforms }),
      }),
    updateChecklist: (sessionId: string, itemId: string, done: boolean) =>
      request<{ session: LiveStreamSession }>(`/api/v1/live-stream/sessions/${sessionId}/checklist`, {
        method: 'PATCH',
        body: JSON.stringify({ itemId, done }),
      }),
    start: (sessionId: string) =>
      request<{ session: LiveStreamSession }>(`/api/v1/live-stream/sessions/${sessionId}/start`, { method: 'POST' }),
    end: (sessionId: string) =>
      request<{ session: LiveStreamSession }>(`/api/v1/live-stream/sessions/${sessionId}/end`, { method: 'POST' }),
  },
  dashboard: {
    summary: () => request<{ dashboard: DashboardSummary }>('/api/v1/dashboard/summary'),
  },
};

export interface DashboardSummary {
  greetingName: string;
  coinBalance: number;
  coinHistory: Array<{ id: string; type: string; amount: number; description: string; createdAt: string }>;
  dna: { id: string; name: string; styleDirection?: string; primaryColors: string[] } | null;
  setup: { hasDna: boolean; hasNexterPersonalization: boolean; hasProject: boolean; hasFile: boolean };
  projects: Array<{ id: string; name: string; type: string; status: string; updatedAt: string; continuePath: string }>;
  projectCount: number;
  files: Array<{
    id: string;
    name: string;
    category: string;
    createdAt: string;
    mimeType: string;
    downloadUrl?: string;
    expiresAt?: string;
    available?: boolean;
  }>;
  fileCount: number;
  activeJobs: DashboardJobItem[];
  recentCompletedJobs: DashboardJobItem[];
  failedJobs: DashboardJobItem[];
  activeJobCount: number;
  streamset: { completed: number; total: number; status: string; href: string } | null;
  today: Array<{ id: string; title: string; platform?: string; scheduledAt?: string; plannerLabel?: string; status?: string }>;
  upcoming: Array<{ id: string; title: string; platform?: string; scheduledAt?: string; plannerLabel?: string; status?: string }>;
  plannedCount: number;
  activity: Array<{ id: string; kind: string; title: string; at: string; href: string }>;
  errors: {
    coins?: string;
    dna?: string;
    projects?: string;
    files?: string;
    jobs?: string;
    calendar?: string;
  };
}

export interface DashboardJobItem {
  id: string;
  kind: string;
  module: string;
  status: string;
  label: string;
  createdAt: string;
  error?: string;
  fileId?: string;
  href: string;
  progressKnown: false;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: string;
  authProviders?: string[];
  coinBalance: number;
  subscriptionTier: string;
  disabled?: boolean;
  locale?: string;
  onboardingCompleted: boolean;
  nexterPreferences?: import('@ucbs/shared').NexterPreferences;
  emailVerified?: boolean;
  signInProvider?: string | null;
  needsEmailVerification?: boolean;
}

export interface CreateDnaBody {
  name: string;
  clanName?: string;
  mascot?: string;
  slogan?: string;
  usagePurpose?: string;
  styleDirection?: string;
  primaryColors?: string[];
  secondaryColors?: string[];
  accentColors?: string[];
  backgroundColors?: string[];
  targetPlatforms?: string[];
  favoriteGenres?: string[];
  gamingStyle?: string;
  brandingStyle?: string;
  promptStyle?: string;
  visualLanguage?: string;
  animations?: string[];
  personalGuidelines?: string;
  fonts?: { name: string; role: 'primary' | 'secondary' | 'accent'; source: 'google' | 'custom' | 'system'; url?: string }[];
  sourceAssets?: { id: string; type: 'logo' | 'profile' | 'banner' | 'reference'; url: string; analyzedAt?: string }[];
  character?: {
    present: boolean;
    type?: string;
    description?: string;
    clothing?: string;
    hair?: string;
    face?: string;
    accessories?: string;
    traits?: string[];
  };
  typography?: { character?: string; weight?: string; direction?: string; nameTreatment?: string };
  atmosphere?: {
    lighting?: string;
    mood?: string;
    effects?: string[];
    particles?: boolean;
    glow?: boolean;
    smoke?: boolean;
  };
  outputPrefs?: { platform?: string; aspectRatios?: string[]; outputKinds?: string[] };
  locks?: {
    name?: boolean;
    colors?: boolean;
    mascot?: boolean;
    character?: boolean;
    style?: boolean;
    fonts?: boolean;
    typography?: boolean;
  };
  lightingStyle?: string;
  dimension?: '2d' | '3d';
}

export interface CoinPackage {
  id: string;
  name: string;
  coins: number;
  priceCents: number;
  bonusCoins: number;
  isPopular?: boolean;
}

export interface CoinTransaction {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  balanceBefore?: number;
  description: string;
  createdAt: string;
  category?: string;
  reason?: string;
  sourceType?: string;
  jobId?: string;
  quoteId?: string;
  refundOfTransactionId?: string;
  stripePaymentIntentId?: string;
  paypalOrderId?: string;
  metadata?: Record<string, unknown>;
}

export interface CoinCatalogItem {
  id: string;
  category?: string;
  label: string;
  coins: number | null;
  pricing: 'fixed' | 'quote';
  note?: string;
}

export interface CoinQuoteSummary {
  id: string;
  kind: string;
  coinCost: number;
  status: string;
  createdAt: string;
  expiresAt: string;
  projectId?: string;
  expired: boolean;
}

export interface LogoVariantResult {
  variant: 'a' | 'b';
  jobId: string;
  status: string;
  imageUrl?: string;
  exports?: { png: string; hd?: string; svg?: string };
  provider?: string;
  prompt: string;
  error?: string;
}

export interface GenerateResult {
  jobId: string;
  status: string;
  imageUrl?: string;
  exports?: { png: string; hd?: string; svg?: string };
  provider?: string;
  error?: string;
  failedCount?: number;
  coinsSpent?: number;
  newBalance?: number;
  message?: string;
  jobs?: GenerationJob[];
  variants?: LogoVariantResult[];
  prompts?: { a: string; b: string };
}

export interface GenerationJob {
  id: string;
  userId: string;
  module: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'partial';
  prompt: string;
  imageUrl?: string;
  exports?: { png: string; hd?: string; svg?: string };
  provider?: string;
  dnaId?: string;
  assetKey?: string;
  projectId?: string;
  batchId?: string;
  parentJobId?: string;
  quoteId?: string;
  fileId?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface StreamsetStatusAsset {
  key: string;
  label: string;
  tab: string;
  module: string;
  present: boolean;
  coinCost: number;
  job?: {
    id: string;
    status: string;
    imageUrl?: string;
    error?: string;
    assetKey?: string;
    module: string;
  };
}

export interface StreamsetStatus {
  packCoinCost: number;
  dna: {
    id: string;
    name: string;
    source: string;
    primaryColors: string[];
    locks?: Record<string, boolean>;
    styleDirection?: string;
  } | null;
  projectName?: string;
  assets: StreamsetStatusAsset[];
  missing: string[];
  jobs: GenerationJob[];
  latestBatch?: {
    id: string;
    status: string;
    batchStatus: string;
    incomplete?: boolean;
    selectedCount?: number;
    completedCount?: number;
    jobs: Array<{
      id: string;
      key?: string;
      label: string;
      status: string;
      imageUrl?: string;
      error?: string;
      fileId?: string;
      fileMissing?: boolean;
      version?: number;
      downloadName?: string;
      retryPolicy?: string;
      retryCoinCost?: number;
      canRetry?: boolean;
      canDownload?: boolean;
    }>;
  };
}

export interface StreamsetDraft {
  id: string;
  platform: string;
  sourceLogoJobId: string | null;
  sourceLogoPresent: boolean;
  dna: (StreamsetStatus['dna'] & {
    secondaryColors?: string[];
    accentColors?: string[];
    mascot?: string;
    visualLanguage?: string;
    brandingStyle?: string;
    fonts?: string[];
  }) | null;
  creatorName: string;
  includeCreatorName: boolean;
  selectedKeys: string[];
  includedAssets: Array<{
    key: string;
    label: string;
    module: string;
    catalogType?: string;
    coinCost: number;
    transparentBackground: boolean;
    transparencyConstraint: string;
  }>;
  layoutPreset: { id: string; label: string; width: number; height: number; aspect: string };
  estimatedCoins: number;
  packDiscountApplied: boolean;
  pricingSku?: 'a_la_carte' | 'three_part' | 'komplettset';
  coinBalance: number;
  canAfford: boolean;
  insufficientCoins: boolean;
  confirmationSummary: string;
  generated: boolean;
  charged: boolean;
}

export interface LayoutElement {
  id: string;
  type: 'facecam' | 'chatbox' | 'alert' | 'widget' | 'logo' | 'text' | 'image' | 'frame' | 'overlay' | 'gameplay';
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  color?: string;
  imageUrl?: string;
  content?: string;
  borderWidth?: number;
  borderRadius?: number;
  borderColor?: string;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
  zIndex?: number;
  fontSize?: number;
  fontWeight?: number | string;
  textAlign?: 'left' | 'center' | 'right';
  fileId?: string;
  sourceFacecamJobId?: string;
  sourceOverlayJobId?: string;
  sourceStickerJobId?: string;
  sourceLogoJobId?: string;
  assetMissing?: boolean;
}

export interface StreamLayout {
  id: string;
  userId: string;
  name: string;
  platform: 'obs' | 'streamlabs' | 'tiktok' | 'twitch' | 'youtube' | 'custom';
  canvas: { width: number; height: number };
  elements: LayoutElement[];
  background?: { mode: 'transparent' | 'solid'; color?: string };
  projectId?: string;
  dnaId?: string;
  version?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChangeableSource {
  id: string;
  kind: string;
  module: string;
  label: string;
  fileId?: string;
  projectId?: string;
  version?: number;
  createdAt: string;
  resultKind: 'image' | 'audio' | 'video' | 'other';
  batchId?: string;
  assetKey?: string;
}

export interface ChangeRequestRecord {
  id: string;
  userId: string;
  jobId: string;
  request: string;
  status: string;
  imageUrlBefore?: string;
  imageUrlAfter?: string;
  fileIdBefore?: string;
  fileIdAfter?: string;
  versionBefore?: string;
  versionAfter?: string;
  quoteId?: string;
  scope?: 'asset' | 'set' | 'dna';
  createdAt: string;
  completedAt?: string;
}

export interface DesignVersion {
  id: string;
  jobId: string;
  version: number;
  imageUrl: string;
  changeRequest?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface AssistantSession {
  id: string;
  userId: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface NexterAction {
  id: string;
  tool: string;
  label: string;
  path?: string;
  payload?: Record<string, unknown>;
  coinCost?: number;
  requiresConfirmation?: boolean;
  autoNavigate?: boolean;
}

export interface NexterChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  suggestions?: string[];
  actions?: NexterAction[];
}

export interface NexterSessionDto {
  id: string;
  userId: string;
  messages: NexterChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface TextStudioJob {
  id: string;
  userId: string;
  kind: string;
  prompt?: string;
  topic: string;
  hook: string;
  title: string;
  caption: string;
  description: string;
  hashtags: string[];
  callToAction: string;
  platformVariants?: Record<string, { hook?: string; title?: string; caption?: string; description?: string; hashtags?: string[]; callToAction?: string }>;
  alternatives?: string[];
  output: string;
  status: string;
  sourceType?: string;
  sourceAssetId?: string;
  sourceLabel?: string;
  projectId?: string;
  dnaId?: string;
  usedTranscript?: boolean;
  transcriptMissingNote?: string;
  revisions?: { at: string; field: string; instruction: string; before: string; after: string }[];
  version?: number;
  parentPackageId?: string;
  error?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AdminAnalytics {
  users: number;
  testers: number;
  disabledUsers?: number;
  generations: number;
  completed: number;
  failed: number;
  pendingJobs?: number;
  processingJobs?: number;
  failRate: number;
  popularModules: { module: string; count: number }[];
  coinsSpent: number;
  coinsBought: number;
  apiCostCents?: number;
  feedback: number;
  inviteCount?: number;
  activeInviteCount?: number;
}

export interface AdminUserSummary {
  id: string;
  displayName: string;
  email: string;
  role: string;
  disabled: boolean;
  coinBalance: number;
  createdAt: string;
  authProviders: string[];
  onboardingCompleted: boolean;
  emailVerified: boolean | null;
}

export interface AdminSystemStatus {
  environment: string;
  firebase: { adminConfigured: boolean; mode: string; projectConsistency?: 'ok' | 'mismatch' | 'not_verified' };
  firestore?: {
    configured: boolean;
    liveChecked?: boolean;
    available?: boolean | null;
    mode?: string;
  };
  storage?: { configured: boolean; liveChecked?: boolean; available?: boolean | null };
  email?: {
    firebaseAuthEmail: 'available' | 'unavailable';
    customProvider: string;
    customProviderStatus: 'configured' | 'not_configured';
    transactional?: 'available' | 'unavailable';
  };
  devStore: boolean;
  checkedAt?: string;
  processUptimeSec?: number;
  payments: { envEnabled: boolean; settingsEnabled: boolean; enabled: boolean };
  settings: {
    registrationMode: 'closed' | 'invite_only' | 'public';
    generationsEnabled: boolean;
    imageGenerationsEnabled: boolean;
    videoGenerationsEnabled: boolean;
    paymentsEnabled: boolean;
    activePricingVersion?: string;
    updatedAt?: string;
  };
  providers: Record<string, { configured: boolean; liveChecked?: boolean; available?: boolean | null }>;
}

export interface TesterFeedbackRow {
  id: string;
  userId: string;
  type?: string;
  module: string;
  route?: string;
  category?: string;
  status?: string;
  subject?: string;
  message: string;
  projectId?: string;
  jobId?: string;
  fileId?: string;
  requestId?: string;
  hasScreenshot?: boolean;
  screenshotDataUrl?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Team {
  id: string;
  name: string;
  slug: string;
  type: string;
  description?: string;
  leaderId: string;
  dnaId?: string;
  memberCount: number;
  maxMembers: number;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: string;
}

export interface Agency {
  id: string;
  name: string;
  slug: string;
  description?: string;
  ownerId: string;
  dnaId?: string;
  memberCount: number;
  clientCount: number;
  projectCount: number;
  createdAt: string;
}

export interface AgencyMember {
  id: string;
  agencyId: string;
  userId: string;
  role: string;
}

export type IntroOutroType = 'intro' | 'outro' | 'stream-start' | 'stream-end';
export type VTuberType = 'vtuber-character' | 'vtuber-emote' | 'vtuber-avatar';

export interface SubtitleEntry {
  start: number;
  end: number;
  text: string;
}

export interface HighlightSegment {
  start: number;
  end: number;
  label: string;
  score: number;
  reason?: string;
  transcriptSegment?: string;
}

export interface MediaJob {
  id: string;
  userId: string;
  type: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  prompt: string;
  title?: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  thumbnailUrl?: string;
  subtitles?: SubtitleEntry[];
  highlights?: HighlightSegment[];
  duration?: number;
  provider?: string;
  dnaId?: string;
  metadata?: Record<string, unknown>;
  error?: string;
  fileMissing?: boolean;
  createdAt: string;
  completedAt?: string;
}

export interface VideoProject {
  id: string;
  userId: string;
  title: string;
  sourceUrl?: string;
  sourceFileId?: string;
  duration: number;
  dnaId?: string;
  format?: string;
  metadata?: VideoMetadata;
  editPlan?: VideoEditPlan;
  scenes: VideoScene[];
  pauses: VideoPause[];
  analyzerVersion?: string;
  subtitles: SubtitleEntry[];
  highlights: HighlightSegment[];
  shorts: MediaJob[];
  renderUrl?: string;
  renderFileId?: string;
  renderJobId?: string;
  fileMissing?: boolean;
  captionsNeedReview?: boolean;
  srtUrl?: string;
  status: 'draft' | 'processing' | 'ready' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface UserFile {
  id: string;
  userId: string;
  name: string;
  mimeType: string;
  size: number;
  category: 'logo' | 'banner' | 'video' | 'project' | 'overlay' | 'sticker' | 'other';
  downloadUrl?: string;
  source?: 'upload' | 'generation';
  projectId?: string;
  sourceJobId?: string;
  sourceAssetId?: string;
  version?: number;
  createdAt: string;
  expiresAt?: string;
  expiresInMs?: number;
  available?: boolean;
}

export interface MarketplaceItem {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  category: string;
  priceCoins: number;
  previewUrl: string;
  downloadUrl: string;
  tags: string[];
  rating: number;
  reviewCount: number;
  downloadCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface CreateListingBody {
  title: string;
  description: string;
  category: string;
  priceCoins: number;
  previewDataUrl: string;
  assetDataUrl: string;
  tags?: string[];
}

export interface MarketplacePurchase {
  id: string;
  buyerId: string;
  itemId: string;
  priceCoins: number;
  createdAt: string;
}

export type SocialPlatform = 'instagram' | 'youtube' | 'tiktok' | 'twitter' | 'discord' | 'twitch';

export interface SocialPost {
  id: string;
  userId: string;
  platform: SocialPlatform;
  content: string;
  mediaUrl?: string;
  mediaAssetId?: string;
  packageId?: string;
  projectId?: string;
  contentType?: string;
  scheduledAt?: string;
  publishedAt?: string;
  status: 'draft' | 'scheduled' | 'published' | 'ready';
  plannerStatus?: 'draft' | 'scheduled' | 'ready';
  plannerLabel?: string;
  publishingAvailable?: boolean;
  analyticsAvailable?: boolean;
  platformConnected?: boolean;
  version?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlanningItemDto {
  id: string;
  source: 'social' | 'event';
  socialPostId?: string;
  eventId?: string;
  title: string;
  content: string;
  platform?: string;
  contentType?: string;
  scheduledAt?: string;
  plannerStatus: 'draft' | 'scheduled' | 'ready';
  plannerLabel: string;
  projectId?: string;
  packageId?: string;
  mediaAssetId?: string;
  mediaUrl?: string;
  version?: number;
  publishingAvailable: false;
}

export interface SocialStats {
  totalPosts: number;
  draft?: number;
  scheduled: number;
  ready?: number;
  published?: number;
  publishingAvailable?: boolean;
  analyticsAvailable?: boolean;
  totalEngagement?: number;
}

export interface CalendarEvent {
  id: string;
  userId: string;
  title: string;
  description?: string;
  type: 'post' | 'video' | 'stream' | 'campaign' | 'deadline';
  platform?: string;
  startAt: string;
  endAt?: string;
  status: 'planned' | 'in_progress' | 'done' | 'cancelled';
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCalendarEventBody {
  title: string;
  description?: string;
  type: CalendarEvent['type'];
  platform?: string;
  startAt: string;
  endAt?: string;
  color?: string;
}

export interface ChatChannel {
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[];
  createdAt: string;
}

export interface TeamChatMessage {
  id: string;
  channelId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
}

export interface AgencyClientRecord {
  id: string;
  agencyId: string;
  name: string;
  email: string;
  contactPerson?: string;
  portalUserId?: string;
  status: 'active' | 'inactive' | 'pending';
  createdAt: string;
}

export interface ClientProjectRecord {
  id: string;
  agencyId: string;
  clientId: string;
  title: string;
  description?: string;
  type: string;
  status: 'draft' | 'in_progress' | 'review' | 'revision' | 'completed';
  deadline?: string;
  feedback: { id: string; userId: string; message: string; createdAt: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgencyClientBody {
  agencyId: string;
  name: string;
  email: string;
  contactPerson?: string;
  portalUserId?: string;
}

export interface CreateAgencyProjectBody {
  agencyId: string;
  clientId: string;
  title: string;
  description?: string;
  type?: string;
  deadline?: string;
}

export interface AgencyManagementOverview {
  agency: Agency | null;
  clients: AgencyClientRecord[];
  projects: ClientProjectRecord[];
  members: AgencyMember[];
  agencies: Agency[];
}

export interface WhiteLabelConfig {
  enabled: boolean;
  customDomain?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  faviconUrl?: string;
  platformName?: string;
}

export interface WhiteLabelPreview {
  previewUrl: string | null;
  cssVariables: Record<string, string>;
  platformName: string;
  customDomain: string | null;
}

export interface MobileAppConfig {
  userId: string;
  pwaEnabled: boolean;
  pushEnabled: boolean;
  androidEnabled: boolean;
  iosEnabled: boolean;
  appName: string;
  themeColor: string;
  splashColor: string;
  shortName: string;
  installUrl: string;
  updatedAt: string;
}

export interface MobileDevice {
  id: string;
  userId: string;
  platform: 'android' | 'ios' | 'pwa';
  deviceName: string;
  lastActiveAt: string;
  pushToken?: string;
  createdAt: string;
}

export interface MobileAppOverview {
  config: MobileAppConfig;
  devices: MobileDevice[];
  manifest: Record<string, unknown>;
  stores: {
    android: { status: string; url: string | null; note: string };
    ios: { status: string; url: string | null; note: string };
    pwa: { status: string; note: string };
  };
}

export type StreamPlatform = 'twitch' | 'youtube' | 'tiktok' | 'kick' | 'facebook';

export interface LiveStreamConfig {
  userId: string;
  rtmpServer: string;
  streamKey: string;
  platforms: StreamPlatform[];
  overlayPackEnabled: boolean;
  alertsEnabled: boolean;
  chatOverlayEnabled: boolean;
  multistreamEnabled: boolean;
  updatedAt: string;
}

export interface LiveStreamSession {
  id: string;
  userId: string;
  title: string;
  platforms: StreamPlatform[];
  status: 'offline' | 'starting' | 'live' | 'ended';
  viewerCount: number;
  startedAt?: string;
  endedAt?: string;
  rtmpUrl: string;
  dnaId?: string;
  checklist: { id: string; label: string; done: boolean }[];
  createdAt: string;
  hlsPlaybackUrl?: string;
}

export interface LiveStreamOverview {
  config: LiveStreamConfig;
  sessions: LiveStreamSession[];
  activeSession: LiveStreamSession | null;
}

export interface PlatformStatus {
  service: string;
  version: string;
  environment: 'production' | 'development';
  frontendUrl: string;
  firebase: { admin: boolean; mode: string };
  stripe: { configured: boolean; liveChecked?: boolean; available?: boolean | null; mode: 'live' | 'test' | 'disabled' };
  paypal: { configured: boolean; liveChecked?: boolean; available?: boolean | null; mode: 'live' | 'sandbox' | 'disabled' };
  resend?: { configured: boolean; liveChecked?: boolean; available?: boolean | null };
  firebaseAuthEmail?: { status: 'available' | 'unavailable'; liveChecked?: boolean };
  customEmailProvider?: { name: string; status: 'configured' | 'not_configured'; liveChecked?: boolean };
  transactionalEmail?: { status: 'available' | 'unavailable' };
  rtmp: { server: string; appName: string; provider: string };
  ai: Record<string, { configured: boolean; liveChecked: boolean; available: boolean | null }>;
  features: {
    devLogin: boolean;
    devCoinPurchase: boolean;
    liveStreaming: boolean;
    oauth?: {
      google: boolean;
      discord: boolean;
      twitch: boolean;
      tiktok: boolean;
      microsoft: boolean;
    };
  };
  killSwitches?: { generationsEnabled: boolean; paymentsEnabled: boolean };
}

export function setAuthToken(token: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (token) {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  }
}
