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

  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  const data = await res.json();
  if (!data.success) {
    throw new ApiError(
      data.error?.message || 'API Fehler',
      data.error?.code || 'UNKNOWN',
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
    sync: (displayName?: string, authProvider?: string) =>
      request<{ user: UserProfile }>('/api/v1/auth/sync', {
        method: 'POST',
        body: JSON.stringify({ displayName, authProvider }),
      }),
    completeOnboarding: () =>
      request('/api/v1/auth/onboarding/complete', { method: 'POST' }),
    stats: () =>
      request<{ generations: number; projects: number; files: number }>('/api/v1/auth/stats'),
  },
  dna: {
    list: () => request<{ dnas: CreatorDNA[]; active: CreatorDNA | null }>('/api/v1/dna'),
    active: () => request<{ dna: CreatorDNA | null }>('/api/v1/dna/active'),
    create: (body: CreateDnaBody) =>
      request<{ dna: CreatorDNA }>('/api/v1/dna', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    analyze: (colors: string[], styleHint?: string) =>
      request<{ analysis: DNAAnalysis }>('/api/v1/dna/analyze', {
        method: 'POST',
        body: JSON.stringify({ colors, styleHint }),
      }),
    activate: (id: string) =>
      request<{ dna: CreatorDNA }>(`/api/v1/dna/${id}/activate`, { method: 'POST' }),
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
    generate: (
      module: 'logo' | 'banner' | 'facecam',
      options?: { style?: string; platform?: string }
    ) =>
      request<GenerateResult>(`/api/v1/${module}/generate`, {
        method: 'POST',
        body: JSON.stringify(options ?? {}),
      }),
    generateBrandingPack: () =>
      request<GenerateResult>('/api/v1/branding/generate-pack', { method: 'POST' }),
  },
  files: {
    list: () => request<{ files: UserFile[] }>('/api/v1/files'),
    get: (id: string) => request<{ file: UserFile & { dataUrl: string } }>(`/api/v1/files/${id}`),
    upload: (body: { name: string; mimeType: string; category: UserFile['category']; dataUrl: string }) =>
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
    create: (jobId: string, requestText: string) =>
      request<{ changeRequest: ChangeRequestRecord }>('/api/v1/change-request', {
        method: 'POST',
        body: JSON.stringify({ jobId, request: requestText }),
      }),
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
    create: (title: string, duration?: number) =>
      request<{ project: VideoProject }>('/api/v1/video', {
        method: 'POST',
        body: JSON.stringify({ title, duration }),
      }),
    detectHighlights: (id: string) =>
      request<{ project: VideoProject }>(`/api/v1/video/${id}/highlights`, { method: 'POST' }),
    generateSubtitles: (id: string) =>
      request<{ project: VideoProject }>(`/api/v1/video/${id}/subtitles`, { method: 'POST' }),
    createShort: (id: string, highlightIndex?: number) =>
      request<{ job: MediaJob; coinsSpent: number; newBalance: number }>(`/api/v1/video/${id}/shorts`, {
        method: 'POST',
        body: JSON.stringify({ highlightIndex }),
      }),
    uploadSource: (id: string, dataUrl: string, duration?: number) =>
      request<{ project: VideoProject }>(`/api/v1/video/${id}/source`, {
        method: 'POST',
        body: JSON.stringify({ dataUrl, duration }),
      }),
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
    create: (body: { platform: SocialPlatform; content: string; scheduledAt?: string }) =>
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
  onboardingCompleted: boolean;
}

export interface CreatorDNA {
  id: string;
  userId: string;
  name: string;
  primaryColors: string[];
  secondaryColors: string[];
  accentColors: string[];
  styleDirection: string;
  isActive: boolean;
  aiAnalysis?: DNAAnalysis;
  brandingRules: { id: string; rule: string; category: string; priority: string }[];
  platformOptimization: { platform: string; aspectRatios: string[]; optimizations: string[] }[];
  version: number;
  createdAt: string;
}

export interface DNAAnalysis {
  colorPalette: { hex: string; name: string; usage: string }[];
  detectedStyle: string;
  confidence: number;
  suggestions: string[];
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
}

export interface CreateDnaBody {
  name: string;
  styleDirection?: string;
  primaryColors?: string[];
  secondaryColors?: string[];
  accentColors?: string[];
  targetPlatforms?: string[];
}

export interface GenerateResult {
  jobId: string;
  status: string;
  imageUrl?: string;
  provider?: string;
  coinsSpent?: number;
  newBalance?: number;
  message?: string;
  jobs?: GenerationJob[];
}

export interface GenerationJob {
  id: string;
  userId: string;
  module: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  prompt: string;
  imageUrl?: string;
  provider?: string;
  dnaId?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface LayoutElement {
  id: string;
  type: 'facecam' | 'chatbox' | 'alert' | 'widget' | 'logo' | 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  color?: string;
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
  duration: number;
  dnaId?: string;
  subtitles: SubtitleEntry[];
  highlights: HighlightSegment[];
  shorts: MediaJob[];
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
  category: 'logo' | 'banner' | 'video' | 'project' | 'overlay' | 'other';
  source?: 'upload' | 'generation';
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
  previewUrl?: string;
  downloadUrl?: string;
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
  scheduledAt?: string;
  publishedAt?: string;
  status: 'draft' | 'scheduled' | 'published';
  engagement: { likes: number; comments: number; shares: number; views: number };
  createdAt: string;
  updatedAt: string;
}

export interface SocialStats {
  totalPosts: number;
  scheduled: number;
  published: number;
  totalEngagement: number;
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
  stripe: { configured: boolean; mode: 'live' | 'test' | 'disabled' };
  paypal: { configured: boolean; mode: 'live' | 'sandbox' | 'disabled' };
  rtmp: { server: string; appName: string; provider: string };
  ai: Record<string, boolean>;
  features: { devLogin: boolean; devCoinPurchase: boolean; liveStreaming: boolean };
}

export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem('auth_token', token);
  } else {
    localStorage.removeItem('auth_token');
  }
}
