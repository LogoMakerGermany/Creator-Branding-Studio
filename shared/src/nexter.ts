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
  | 'text';

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
  logoCount?: number;
  bannerCount?: number;
  overlayCount?: number;
  facecamCount?: number;
  stickerCount?: number;
  assetInventory?: string[];
}

export interface NexterQuote {
  id: string;
  userId: string;
  kind: NexterQuoteKind;
  coinCost: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  createdAt: string;
  expiresAt: string;
  projectId?: string;
  payload?: Record<string, unknown>;
}

export const NEXTER_STUDIO_PATHS: Record<string, string> = {
  logo: '/logo-studio',
  streamset: '/streamset-studio',
  animation: '/animation-studio',
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
  projects: '/projects',
};

export const NEXTER_QUOTE_TTL_MS = 15 * 60 * 1000;
