/** NEXTER — central creator OS assistant (user-facing). MAGIK stays the logo prompt engine. */

export type NexterOrbState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'generating'
  | 'success'
  | 'warning';

export type NexterToolName =
  | 'open_studio'
  | 'quote_generation'
  | 'start_generation'
  | 'cancel_generation'
  | 'analyze_asset'
  | 'suggest_variant';

export type NexterQuoteKind =
  | 'logo'
  | 'banner'
  | 'overlay'
  | 'facecam'
  | 'sticker'
  | 'streamset'
  | 'mockup'
  | 'animation'
  | 'text'
  | 'music'
  | 'voice'
  | 'captions';

export interface NexterChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  suggestions?: string[];
  actions?: NexterAction[];
}

export interface NexterAction {
  id: string;
  tool: NexterToolName;
  label: string;
  path?: string;
  payload?: Record<string, unknown>;
  coinCost?: number;
  requiresConfirmation?: boolean;
}

export interface NexterSession {
  id: string;
  userId: string;
  messages: NexterChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface NexterMemoryEntry {
  id: string;
  userId: string;
  key: string;
  value: string;
  source: 'logo' | 'interaction' | 'preference' | 'dna';
  createdAt: string;
}

export interface NexterRecentJob {
  id: string;
  module: string;
  status: string;
  createdAt: string;
}

export interface NexterContextSnapshot {
  displayName?: string;
  addressAs?: string;
  language?: string;
  coinBalance: number;
  hasDna: boolean;
  dnaId?: string;
  dnaName?: string;
  dnaVersion?: number;
  dnaSource?: 'project' | 'active' | 'none';
  projectId?: string;
  projectName?: string;
  projectDnaId?: string;
  styleDirection?: string;
  primaryColors: string[];
  secondaryColors?: string[];
  accentColors?: string[];
  preferredPlatforms?: string[];
  creationInterests?: string[];
  stylePreferences?: string[];
  creatorGoals?: string[];
  uiTheme?: string;
  accentPreset?: string;
  customPrimary?: string | null;
  customAccent?: string | null;
  visualLanguage?: string;
  brandingStyle?: string;
  typographySummary?: string;
  dimension?: string;
  fontNames?: string[];
  characterType?: string;
  mascot?: string;
  characterDescription?: string;
  slogan?: string;
  locks?: import('./creator-dna').DnaLocks;
  projectCount: number;
  projectNames: string[];
  fileCount: number;
  recentJobs: NexterRecentJob[];
  missingAssets: string[];
  lastModule?: string;
  videoProjectId?: string;
  videoHighlights?: Array<{ start: number; end: number; label: string; score: number; reason?: string }>;
  lastShortId?: string;
  lastShortVideoProjectId?: string;
  contentPackageId?: string;
  contentPackageTitle?: string;
  lastLogoId?: string;
  lastBannerId?: string;
  lastOverlayId?: string;
  lastFacecamId?: string;
  lastStickerId?: string;
  lastMockupId?: string;
  lastAnimationId?: string;
  lastMusicId?: string;
  lastVoiceId?: string;
  lastLayoutId?: string;
  lastLayoutName?: string;
  layoutCount?: number;
  layoutPlatform?: string;
  layoutElementCount?: number;
  logoCount?: number;
  bannerCount?: number;
  overlayCount?: number;
  facecamCount?: number;
  stickerCount?: number;
  assetInventory?: string[];
  voiceOutputEnabled?: boolean;
  voiceCatalogId?: string | null;
  pendingQuotes?: Array<{
    kind: string;
    coinCost: number;
    expiresAt: string;
    expired: boolean;
  }>;
}

export interface NexterQuote {
  id: string;
  userId: string;
  kind: NexterQuoteKind;
  coinCost: number;
  status: 'pending' | 'processing' | 'confirmed' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  expiresAt: string;
  projectId?: string;
  payload?: Record<string, unknown>;
}

export const NEXTER_STUDIO_PATHS: Record<string, string> = {
  logo: '/logo-studio',
  streamset: '/streamset-studio',
  animation: '/animation-studio',
  music: '/ai-music',
  voice: '/ai-voice',
  video: '/video-studio',
  shorts: '/shorts-studio',
  social: '/social-studio',
  text: '/text-studio',
  mockup: '/mockup-studio',
  dna: '/creator-dna',
  banner: '/banner-studio',
  overlay: '/overlay-studio',
  facecam: '/facecam-studio',
  sticker: '/sticker-studio',
  files: '/file-cloud',
  layout: '/layout-studio',
  projects: '/projects',
  calendar: '/content-calendar',
  coins: '/coins',
  support: '/support',
};

export const NEXTER_QUOTE_TTL_MS = 15 * 60 * 1000;
