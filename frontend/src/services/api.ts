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
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function getToken(): Promise<string | null> {
  const stored = localStorage.getItem('auth_token');
  if (stored) return stored;

  const { getIdToken } = await import('@/lib/firebase');
  return getIdToken();
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

  let data: { success?: boolean; error?: { message?: string; code?: string }; data?: T };
  try {
    data = await res.json();
  } catch {
    throw new ApiError(
      res.ok ? 'Ungültige Server-Antwort' : `Server-Fehler (${res.status})`,
      'INVALID_RESPONSE',
      res.status
    );
  }

  if (!data.success) {
    const code = data.error?.code || 'UNKNOWN';
    const friendly: Record<string, string> = {
      AI_NOT_CONFIGURED: 'KI-Funktion nicht konfiguriert. Ein Provider-Key fehlt.',
      AI_UNAVAILABLE: 'Nexter ist ohne OpenAI-Key nicht verfügbar. Studios funktionieren weiter.',
      INSUFFICIENT_COINS: 'Nicht genügend Coins.',
      DAILY_JOB_LIMIT: 'Tägliches Job-Limit erreicht.',
      CONCURRENT_JOB_LIMIT: 'Zu viele laufende Jobs. Bitte warten.',
      ACCOUNT_DISABLED: 'Dieses Konto ist deaktiviert.',
      VALIDATION_ERROR: 'Ungültige Eingabe.',
      CHANGE_REQUIRES_QUOTE: 'Änderung braucht ein bestätigtes Nexter-Angebot.',
      FEATURE_NOT_AVAILABLE: 'Diese Funktion ist in NEXTER V1 nicht verfügbar.',
      NETWORK_ERROR: 'Netzwerkfehler. Bitte Verbindung prüfen.',
      PAYMENT_FAILED: 'Zahlung fehlgeschlagen. Es wurden keine Coins gutgeschrieben.',
      INVALID_UPLOAD: 'Datei ungültig. Bitte ein unterstütztes Format wählen.',
      UPLOAD_FAILED: 'Upload fehlgeschlagen. Bitte erneut versuchen.',
      FILE_TOO_LARGE: 'Datei ist zu groß.',
      INTERNAL_ERROR: 'Ein interner Fehler ist aufgetreten. Bitte später erneut versuchen.',
      EXPORT_FAILED: 'Export fehlgeschlagen. Bitte erneut versuchen.',
    };
    throw new ApiError(
      friendly[code] || data.error?.message || `Fehler (${res.status})`,
      code,
      res.status
    );
  }
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
    me: () => request<{ user: UserProfile; activeDna: CreatorDNA | null }>('/api/v1/auth/me'),
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
    sync: (displayName?: string, authProvider?: string, inviteCode?: string) =>
      request<{ user: UserProfile }>('/api/v1/auth/sync', {
        method: 'POST',
        body: JSON.stringify({ displayName, authProvider, inviteCode }),
      }),
    completeOnboarding: (displayName?: string) =>
      request('/api/v1/auth/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify({ displayName }),
      }),
    stats: () =>
      request<{ generations: number; projects: number; files: number }>('/api/v1/auth/stats'),
    exportData: () => request<{ export: Record<string, unknown> }>('/api/v1/auth/export'),
    deleteAccount: (confirmation: string) =>
      request<{ disabled: boolean; anonymized: boolean }>('/api/v1/auth/account/delete', {
        method: 'POST',
        body: JSON.stringify({ confirmation }),
      }),
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
    list: () => request<{ projects: import('@ucbs/shared').Project[] }>('/api/v1/projects'),
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
        }>;
        files: UserFile[];
        videos: Array<{ id: string; title: string; renderUrl?: string; createdAt: string }>;
        shorts: Array<{ id: string; videoUrl?: string; createdAt: string }>;
        content: Array<{ id: string; title: string; createdAt: string }>;
        changeRequests: ChangeRequestRecord[];
        versionsByJob: Record<string, import('@ucbs/shared').DesignVersion[] | { id: string; version: number; imageUrl: string; changeRequest?: string }[]>;
        missing: string[];
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
    transactions: () => request<{ transactions: CoinTransaction[] }>('/api/v1/coins/transactions'),
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
    list: (projectId?: string) =>
      request<{ files: UserFile[] }>(
        `/api/v1/files${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`
      ),
    get: (id: string) => request<{ file: UserFile & { dataUrl: string } }>(`/api/v1/files/${id}`),
    upload: (body: {
      name: string;
      mimeType: string;
      category: UserFile['category'];
      dataUrl: string;
      projectId?: string;
      rightsConfirmed: true;
    }) =>
      request<{ file: UserFile }>('/api/v1/files', { method: 'POST', body: JSON.stringify(body) }),
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
  },
  changeRequest: {
    list: () => request<{ changeRequests: ChangeRequestRecord[]; availableJobs: GenerationJob[] }>('/api/v1/change-request'),
    quote: (jobId: string, requestText: string, projectId?: string) =>
      request<{
        quote: { id: string; kind: string; coinCost: number; status: string };
        module: string;
        honestLabel: string;
      }>('/api/v1/change-request/quote', {
        method: 'POST',
        body: JSON.stringify({ jobId, request: requestText, projectId }),
      }),
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
    chat: (message: string, meta?: { path?: string; hint?: string; projectId?: string }) =>
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
      request<{ exportUrl: string; files: number; missing: string[]; exportedAt: string }>(
        `/api/v1/streamset/export${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`
      ),
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
      module: string;
      message: string;
      category?: string;
      route?: string;
      screenshotDataUrl?: string;
    }) =>
      request<{ feedback: TesterFeedbackRow }>('/api/v1/feedback', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    get: (id: string) => request<{ feedback: TesterFeedbackRow }>(`/api/v1/feedback/${id}`),
  },
  legal: {
    page: (slug: 'impressum' | 'datenschutz' | 'agb' | 'widerruf' | 'cookies') =>
      request<{ title: string; html: string; draft?: boolean; notice?: string }>(`/api/v1/legal/${slug}`),
  },
  admin: {
    analytics: () => request<{ analytics: AdminAnalytics }>('/api/v1/admin/analytics'),
    users: (q?: string) =>
      request<{ users: UserProfile[] }>(`/api/v1/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    setRole: (userId: string, role: string, reason: string) =>
      request(`/api/v1/admin/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role, reason }),
      }),
    disable: (userId: string, disabled: boolean, reason?: string) =>
      request(`/api/v1/admin/users/${userId}/disable`, {
        method: 'POST',
        body: JSON.stringify({ disabled, reason }),
      }),
    coins: (userId: string, amount: number, reason: string, confirm: true, idempotencyKey?: string) =>
      request(`/api/v1/admin/users/${userId}/coins`, {
        method: 'POST',
        body: JSON.stringify({ amount, reason, confirm, idempotencyKey }),
      }),
    user: (userId: string) =>
      request<{ user: UserProfile; transactions: unknown[]; jobs: unknown[]; audit: unknown[] }>(
        `/api/v1/admin/users/${userId}`
      ),
    audit: () => request<{ audit: Array<{ id: string; actorUserId: string; action: string; targetUserId?: string; reason?: string; createdAt: string }> }>('/api/v1/admin/audit'),
    payments: () =>
      request<{ stripe: Array<{ id: string; provider: string; status: string; packageId?: string; error?: string }>; paypal: Array<{ id: string; provider: string; status: string; packageId?: string; error?: string }> }>(
        '/api/v1/admin/payments'
      ),
    recoverJobs: () => request<{ recovery: unknown }>('/api/v1/admin/jobs/recover', { method: 'POST' }),
    feedback: () => request<{ feedback: TesterFeedbackRow[] }>('/api/v1/admin/feedback'),
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
    create: (title: string, duration?: number, format?: string) =>
      request<{ project: VideoProject }>('/api/v1/video', {
        method: 'POST',
        body: JSON.stringify({ title, duration, format }),
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
        burnSubtitles?: boolean;
      }
    ) =>
      request<{ job: MediaJob; coinsSpent: number; newBalance?: number }>(`/api/v1/video/${id}/shorts`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    uploadSource: (id: string, dataUrl: string, duration?: number) =>
      request<{ project: VideoProject }>(`/api/v1/video/${id}/source`, {
        method: 'POST',
        body: JSON.stringify({ dataUrl, duration, rightsConfirmed: true as const }),
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
    generate: (prompt?: string, title?: string, duration?: number) =>
      request<{ job: MediaJob; coinsSpent: number; newBalance: number }>('/api/v1/ai/music/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt, title, duration }),
      }),
    getJob: (id: string) => request<{ job: MediaJob }>(`/api/v1/ai/music/${id}`),
  },
  aiVoice: {
    list: () => request<{ jobs: MediaJob[] }>('/api/v1/ai/voice'),
    generate: (prompt?: string, title?: string) =>
      request<{ job: MediaJob; coinsSpent: number; newBalance: number }>('/api/v1/ai/voice/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt, title }),
      }),
    getJob: (id: string) => request<{ job: MediaJob }>(`/api/v1/ai/voice/${id}`),
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
    }) =>
      request<{ post: SocialPost }>('/api/v1/social', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<SocialPost>) =>
      request<{ post: SocialPost }>(`/api/v1/social/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => request(`/api/v1/social/${id}`, { method: 'DELETE' }),
  },
  calendar: {
    list: () => request<{ events: CalendarEvent[]; upcoming: CalendarEvent[] }>('/api/v1/calendar'),
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
};

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: string;
  coinBalance: number;
  subscriptionTier: string;
  disabled?: boolean;
  onboardingCompleted: boolean;
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
  description: string;
  createdAt: string;
  stripePaymentIntentId?: string;
  paypalOrderId?: string;
  metadata?: Record<string, unknown>;
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
  status: 'queued' | 'processing' | 'completed' | 'failed';
  prompt: string;
  imageUrl?: string;
  exports?: { png: string; hd?: string; svg?: string };
  provider?: string;
  dnaId?: string;
  assetKey?: string;
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
}

export interface LayoutElement {
  id: string;
  type: 'facecam' | 'chatbox' | 'alert' | 'widget' | 'logo' | 'text' | 'image' | 'frame' | 'overlay';
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
}

export interface StreamLayout {
  id: string;
  userId: string;
  name: string;
  platform: 'obs' | 'streamlabs' | 'tiktok' | 'twitch';
  canvas: { width: number; height: number };
  elements: LayoutElement[];
  dnaId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChangeRequestRecord {
  id: string;
  userId: string;
  jobId: string;
  request: string;
  status: string;
  imageUrlBefore?: string;
  imageUrlAfter?: string;
  versionBefore?: string;
  versionAfter?: string;
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
  error?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AdminAnalytics {
  users: number;
  testers: number;
  generations: number;
  completed: number;
  failed: number;
  failRate: number;
  popularModules: { module: string; count: number }[];
  coinsSpent: number;
  coinsBought: number;
  apiCostCents?: number;
  feedback: number;
}

export interface TesterFeedbackRow {
  id: string;
  userId: string;
  module: string;
  route?: string;
  category?: string;
  status?: string;
  message: string;
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
  srtUrl?: string;
  status: 'draft' | 'processing' | 'ready';
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
  createdAt: string;
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
  scheduledAt?: string;
  publishedAt?: string;
  status: 'draft' | 'scheduled' | 'published' | 'ready';
  plannerStatus?: 'draft' | 'scheduled' | 'ready';
  plannerLabel?: string;
  publishingAvailable?: boolean;
  analyticsAvailable?: boolean;
  platformConnected?: boolean;
  createdAt: string;
  updatedAt: string;
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
  rtmp: { server: string; appName: string; provider: string };
  ai: Record<string, { configured: boolean; liveChecked: boolean; available: boolean | null }>;
  features: { devLogin: boolean; devCoinPurchase: boolean; liveStreaming: boolean };
}

export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem('auth_token', token);
  } else {
    localStorage.removeItem('auth_token');
  }
}
