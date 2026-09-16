/** NEXTER — central creator OS assistant (user-facing). MAGIK stays the logo prompt engine. */

export const NEXTER_ORB_STATES = [
  'idle',
  'listening',
  'thinking',
  'speaking',
  'generating',
  'success',
  'warning',
  'error',
] as const;

export type NexterOrbState = (typeof NEXTER_ORB_STATES)[number];

export const NEXTER_ORB_STATUS_LABEL: Record<NexterOrbState, string> = {
  idle: 'Bereit',
  listening: 'Hört zu',
  thinking: 'Denkt',
  speaking: 'Spricht',
  generating: 'Erstellt',
  success: 'Erfolgreich',
  warning: 'Hinweis',
  error: 'Fehler',
};

export function isNexterOrbState(value: unknown): value is NexterOrbState {
  return typeof value === 'string' && (NEXTER_ORB_STATES as readonly string[]).includes(value);
}

export function resolveNexterOrbState(value: unknown): NexterOrbState {
  return isNexterOrbState(value) ? value : 'idle';
}

export function nexterOrbStatusLabel(value: unknown): string {
  return NEXTER_ORB_STATUS_LABEL[resolveNexterOrbState(value)];
}

export function clampNexterAudioLevel(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

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
  | 'ai-video'
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
  /** True only for explicit NAVIGATION_ACTION. Suggested studio buttons stay click-only. */
  autoNavigate?: boolean;
}

export function shouldAutoNavigateNexterStudio(
  action: { tool?: string; path?: string; autoNavigate?: boolean } | undefined | null,
  options: { currentPath?: string; awaitingConfirm?: boolean } = {}
): boolean {
  if (!action || action.tool !== 'open_studio' || !action.path) return false;
  if (options.awaitingConfirm) return false;
  const target = action.path.split('?')[0];
  const current = (options.currentPath ?? '').split('?')[0];
  if (current && target === current) return false;
  return action.autoNavigate === true;
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
  presentAssets?: string[];
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
  'ai-video': '/ai-video',
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
