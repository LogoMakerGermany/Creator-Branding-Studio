import type {
  DnaAssistantPrefs,
  DnaAudioPrefs,
  DnaBrandV2,
  DnaIdentityV2,
  DnaLearnedPreference,
  DnaPreferenceMeta,
  DnaStreamPrefs,
  DnaVideoPrefs,
} from './creator-dna-v2';
import {
  buildCreatorProfileContext,
  dnaV2ContentFragment,
  sanitizeDnaV2Fields,
} from './creator-dna-v2';

export * from './creator-dna-v2';

export interface CreatorDNA {
  id: string;
  userId: string;
  name: string;
  type: DNAType;
  /** Clan / team name when relevant */
  clanName?: string;
  /** Mascot or character motif */
  mascot?: string;
  primaryColors: string[];
  secondaryColors: string[];
  accentColors: string[];
  styleDirection: StyleDirection;
  /** Favorite games / content genres */
  favoriteGenres: string[];
  /** Gaming visual/play style (e.g. competitive FPS, cozy RPG) */
  gamingStyle: string;
  /** Branding presentation style */
  brandingStyle: string;
  /** How AI prompts should be phrased for this creator */
  promptStyle: string;
  /** Visual language summary (Bildsprache) */
  visualLanguage: string;
  /** Preferred motion / animation cues */
  animations: string[];
  /** Free-form personal brand guidelines */
  personalGuidelines: string;
  fonts: FontConfig[];
  brandingRules: BrandingRule[];
  platformOptimization: PlatformConfig[];
  targetAudience: TargetAudience;
  designLanguage: DesignLanguage;
  sourceAssets: SourceAsset[];
  aiAnalysis?: DNAAnalysis;
  /**
   * Locked traits must not be persisted as DNA changes.
   * Locks do not override an explicit current generation request.
   */
  locks?: DnaLocks;
  /** Lazy schema marker. Missing on legacy docs; readers treat absent as 1. */
  schemaVersion?: number;
  lightingStyle?: string;
  dimension?: '2d' | '3d';
  projectId?: string;
  slogan?: string;
  usagePurpose?: string;
  backgroundColors?: string[];
  character?: DnaCharacter;
  typography?: DnaTypography;
  atmosphere?: DnaAtmosphere;
  outputPrefs?: DnaOutputPrefs;
  identity?: DnaIdentityV2;
  contentCategories?: string[];
  dislikedColors?: string[];
  visualStyles?: string[];
  preferredShapes?: string[];
  stream?: DnaStreamPrefs;
  video?: DnaVideoPrefs;
  audio?: DnaAudioPrefs;
  assistant?: DnaAssistantPrefs;
  brand?: DnaBrandV2;
  preferenceSources?: Record<string, DnaPreferenceMeta>;
  learned?: DnaLearnedPreference[];
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DnaCharacter {
  present: boolean;
  type?: string;
  description?: string;
  clothing?: string;
  hair?: string;
  face?: string;
  accessories?: string;
  traits?: string[];
  /** Sidecar CCD record id — not a second identity system. */
  ccdCharacterId?: string;
}

export interface DnaTypography {
  character?: string;
  weight?: string;
  direction?: string;
  nameTreatment?: string;
}

export interface DnaAtmosphere {
  lighting?: string;
  mood?: string;
  effects?: string[];
  particles?: boolean;
  glow?: boolean;
  smoke?: boolean;
}

export interface DnaOutputPrefs {
  platform?: string;
  aspectRatios?: string[];
  outputKinds?: string[];
}

export interface DnaLocks {
  name?: boolean;
  colors?: boolean;
  mascot?: boolean;
  character?: boolean;
  style?: boolean;
  fonts?: boolean;
  typography?: boolean;
}

export type DNAType = 'creator' | 'team' | 'agency' | 'client';

export type StyleDirection =
  | 'gaming'
  | 'streaming'
  | 'music'
  | 'anime'
  | 'fantasy'
  | 'esports'
  | 'horror'
  | 'neon'
  | 'realistic'
  | 'minimal'
  | 'corporate'
  | 'cyberpunk'
  | 'clean'
  | 'cartoon'
  | 'cinematic'
  | 'custom';

export const STYLE_DIRECTIONS: StyleDirection[] = [
  'gaming',
  'streaming',
  'music',
  'anime',
  'fantasy',
  'esports',
  'horror',
  'neon',
  'realistic',
  'minimal',
  'corporate',
  'cyberpunk',
  'clean',
  'cartoon',
  'cinematic',
  'custom',
];

export const DNA_PLATFORMS = [
  'twitch',
  'youtube',
  'tiktok',
  'kick',
  'instagram',
  'discord',
  'facebook',
  'other',
] as const;

export interface FontConfig {
  name: string;
  role: 'primary' | 'secondary' | 'accent';
  source: 'google' | 'custom' | 'system';
  url?: string;
}

export interface BrandingRule {
  id: string;
  rule: string;
  category: 'color' | 'typography' | 'layout' | 'imagery' | 'tone';
  priority: 'required' | 'recommended' | 'optional';
}

export interface PlatformConfig {
  platform: (typeof DNA_PLATFORMS)[number];
  aspectRatios: string[];
  safeZones?: SafeZone[];
  optimizations: string[];
}

export interface SafeZone {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TargetAudience {
  ageRange: string;
  interests: string[];
  platforms: string[];
  tone: string;
  description: string;
}

export interface DesignLanguage {
  mood: string[];
  keywords: string[];
  visualElements: string[];
  doNotUse: string[];
}

export interface SourceAsset {
  id: string;
  type: 'logo' | 'profile' | 'banner' | 'reference';
  /** Prefer `file:<fileId>` or omit. Data URLs must not be persisted. */
  url: string;
  /** Owned `files` document id. Resolve only if file.userId === dna.userId. */
  fileId?: string;
  analyzedAt?: string;
}

export const DNA_CHARACTER_TYPES = [
  'none',
  'animal',
  'human',
  'robot',
  'fantasy',
  'mascot',
  'custom',
] as const;

export type DnaCharacterType = (typeof DNA_CHARACTER_TYPES)[number];

export interface DNAAnalysis {
  colorPalette: { hex: string; name: string; usage: string }[];
  detectedStyle: StyleDirection;
  confidence: number;
  suggestions: string[];
  analyzedAt: string;
  /** true when OpenAI Vision was used; false for color-only extraction */
  source: 'vision' | 'colors';
  character?: string;
  typographyStyle?: string;
  lightingStyle?: string;
  dimension?: '2d' | '3d';
  genreTags?: string[];
  characterStructured?: DnaCharacter;
  typography?: DnaTypography;
  atmosphere?: DnaAtmosphere;
  recurringTraits?: string[];
}

export interface DNAVersion {
  id: string;
  dnaId: string;
  version: number;
  snapshot: CreatorDNA;
  changeDescription?: string;
  createdAt: string;
}

export function isCharacterLocked(dna: Pick<CreatorDNA, 'locks'>): boolean {
  return Boolean(dna.locks?.character || dna.locks?.mascot);
}

export function isTypographyLocked(dna: Pick<CreatorDNA, 'locks'>): boolean {
  return Boolean(dna.locks?.typography || dna.locks?.fonts);
}

/**
 * Server-side lock enforcement: incoming writes cannot replace locked traits.
 * A trait is enforced only if it was already locked before this write.
 * That lets the owner set values and lock them in the same save.
 * Unlocking in the same request allows the new value through.
 * Generators must not send lock:false.
 */
export function applyDnaLocks(existing: CreatorDNA, incoming: Partial<CreatorDNA>): Partial<CreatorDNA> {
  const prev: DnaLocks = existing.locks ?? {};
  const next: DnaLocks = { ...prev, ...(incoming.locks ?? {}) };
  const out: Partial<CreatorDNA> = { ...incoming };
  const still = (key: keyof DnaLocks) => Boolean(prev[key] && next[key]);

  if (still('name') && incoming.name !== undefined) out.name = existing.name;
  if (still('colors')) {
    if (incoming.primaryColors !== undefined) out.primaryColors = existing.primaryColors;
    if (incoming.secondaryColors !== undefined) out.secondaryColors = existing.secondaryColors;
    if (incoming.accentColors !== undefined) out.accentColors = existing.accentColors;
    if (incoming.backgroundColors !== undefined) out.backgroundColors = existing.backgroundColors;
    if (incoming.dislikedColors !== undefined) out.dislikedColors = existing.dislikedColors;
  }
  if (still('character') || still('mascot')) {
    if (incoming.mascot !== undefined) out.mascot = existing.mascot;
    if (incoming.character !== undefined) out.character = existing.character;
    if (incoming.brand !== undefined) {
      out.brand = {
        ...(incoming.brand ?? {}),
        mascotAssetId: existing.brand?.mascotAssetId,
      };
    }
  }
  if (still('style') && incoming.styleDirection !== undefined) {
    out.styleDirection = existing.styleDirection;
  }
  if (still('typography') || still('fonts')) {
    if (incoming.fonts !== undefined) out.fonts = existing.fonts;
    if (incoming.typography !== undefined) out.typography = existing.typography;
  }
  return out;
}

/** AI analysis is a proposal — never overwrite locked fields, never change lock flags. */
export function mergeAnalysisIntoDna(
  existing: CreatorDNA,
  proposed: Partial<CreatorDNA>
): Partial<CreatorDNA> {
  const { locks: _ignored, ...rest } = proposed;
  return applyDnaLocks(existing, rest);
}

export type DnaResolveSource = 'project' | 'active' | 'none';

export function pickDnaForRequest(input: {
  userId: string;
  project?: { ownerId: string; dnaId?: string } | null;
  projectDna?: CreatorDNA | null;
  activeDna?: CreatorDNA | null;
}): { dna: CreatorDNA | null; source: DnaResolveSource } {
  const project = input.project;
  if (project && project.ownerId === input.userId && project.dnaId) {
    if (input.projectDna && input.projectDna.userId === input.userId) {
      return { dna: input.projectDna, source: 'project' };
    }
  }
  if (input.activeDna && input.activeDna.userId === input.userId) {
    return { dna: input.activeDna, source: 'active' };
  }
  return { dna: null, source: 'none' };
}

export function characterPromptFromDna(dna: CreatorDNA): string | null {
  const c = dna.character;
  if (c?.present === false && !dna.mascot) return null;
  const parts = [
    c?.description || dna.mascot || null,
    c?.type ? `type ${c.type}` : null,
    c?.clothing ? `clothing ${c.clothing}` : null,
    c?.hair ? `hair ${c.hair}` : null,
    c?.face ? `face ${c.face}` : null,
    c?.accessories ? `accessories ${c.accessories}` : null,
    c?.traits?.length ? `traits ${c.traits.join(', ')}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join('. ') : null;
}

/** Compact DNA fragment for every AI prompt — generators must append this. */
export function buildDnaPromptContext(
  dna: CreatorDNA,
  opts?: { requestText?: string; consumer?: import('./creator-dna-v2').DnaContextConsumer }
): string {
  return buildCreatorProfileContext(dna, {
    requestText: opts?.requestText,
    consumer: opts?.consumer ?? 'chat',
    maxChars: 1600,
  });
}

export interface LogoLockPatch {
  logoName?: string;
  primaryColor?: string;
  selectedColors?: string[];
  magikCharacter?: string;
}

function hasExplicitText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasExplicitList(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => hasExplicitText(item) || item != null);
}

/**
 * Apply explicit Creator DNA only where the current request is silent.
 * Locks freeze stored DNA; they must not overwrite an explicit request
 * such as "make this logo red".
 */
export function applyLockedDnaToGeneration<T extends LogoLockPatch>(dna: CreatorDNA, opts: T): T {
  const out = { ...opts };
  const requestName = hasExplicitText(out.logoName);
  const requestColors = hasExplicitText(out.primaryColor) || hasExplicitList(out.selectedColors);
  const requestCharacter = hasExplicitText(out.magikCharacter);

  if (!requestName && dna.name) out.logoName = dna.name;
  if (!requestColors && dna.primaryColors.length) {
    out.selectedColors = dna.primaryColors;
    out.primaryColor = dna.primaryColors[0];
  }
  if (!requestCharacter) {
    const phrase = dna.character?.description || dna.mascot;
    if (phrase) out.magikCharacter = phrase;
  }
  return out;
}

export const DNA_PRECEDENCE = [
  'current_request',
  'explicit_dna',
  'learned_dna',
  'platform_default',
  'system_default',
] as const;

export type PreferenceAuthority = (typeof DNA_PRECEDENCE)[number];

export function isPreferenceValuePresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Central reusable rule: current request > explicit DNA > learned DNA > platform > system. */
export function resolvePreference<T>(layers: {
  request?: T;
  explicit?: T;
  learned?: T;
  platform?: T;
  system?: T;
}): { value: T | undefined; source: PreferenceAuthority | 'none' } {
  if (isPreferenceValuePresent(layers.request)) {
    return { value: layers.request, source: 'current_request' };
  }
  if (isPreferenceValuePresent(layers.explicit)) {
    return { value: layers.explicit, source: 'explicit_dna' };
  }
  if (isPreferenceValuePresent(layers.learned)) {
    return { value: layers.learned, source: 'learned_dna' };
  }
  if (isPreferenceValuePresent(layers.platform)) {
    return { value: layers.platform, source: 'platform_default' };
  }
  if (isPreferenceValuePresent(layers.system)) {
    return { value: layers.system, source: 'system_default' };
  }
  return { value: undefined, source: 'none' };
}

export function requestOverridesAvoidTerm(requestText: string | undefined, term: string): boolean {
  const needle = term.trim().toLowerCase().replace(/^(no|avoid)\s+/, '');
  if (!needle) return false;
  const req = (requestText ?? '').toLowerCase();
  if (!req) return false;
  if (new RegExp(`\\b(no|kein|ohne|not use|do not use|don't use|nicht)\\b.{0,24}${escapeRegExp(needle)}`).test(req)) {
    return false;
  }
  if (req.includes(needle)) return true;
  if ((needle === 'text' || needle === 'schrift') && /\b(put|schreib|lettering|titel|in the logo|ins logo)\b/i.test(req)) {
    return true;
  }
  return false;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Negative DNA prefs apply only when the current request does not mention them. */
export function activeAvoidList(requestText: string | undefined, avoid: string[]): string[] {
  return avoid.filter((term) => term.trim() && !requestOverridesAvoidTerm(requestText, term));
}

export const DNA_VERSION_RETENTION = 20;
export const DNA_SOURCE_ASSET_LIMIT = 12;
const DNA_SOURCE_URL_MAX = 2048;
const FILE_REF = /^file:([A-Za-z0-9_-]+)$/;

export function isPersistedDnaDataUrl(url: string): boolean {
  return /^data:/i.test(url.trim());
}

/** Strip data URLs and normalize owned file references. Does not look up Firestore. */
export function sanitizeDnaSourceAssets(assets: SourceAsset[] | undefined | null): SourceAsset[] {
  const out: SourceAsset[] = [];
  for (const asset of assets ?? []) {
    if (!asset?.id || !asset.type) continue;
    const fileFromUrl = FILE_REF.exec((asset.url ?? '').trim())?.[1];
    const fileId = (asset.fileId || fileFromUrl || '').trim();
    if (fileId) {
      out.push({
        id: asset.id,
        type: asset.type,
        url: `file:${fileId}`,
        fileId,
        analyzedAt: asset.analyzedAt,
      });
      continue;
    }
    const url = (asset.url ?? '').trim();
    if (!url || isPersistedDnaDataUrl(url) || url.length > DNA_SOURCE_URL_MAX) continue;
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({
      id: asset.id,
      type: asset.type,
      url,
      analyzedAt: asset.analyzedAt,
    });
  }
  return out.slice(0, DNA_SOURCE_ASSET_LIMIT);
}

/** Canonical explicit-field key used to skip no-op DNA version snapshots. */
export function dnaContentKey(dna: CreatorDNA): string {
  const v2 = dnaV2ContentFragment(sanitizeDnaV2Fields(dna));
  return JSON.stringify({
    id: dna.id,
    userId: dna.userId,
    name: dna.name,
    type: dna.type,
    clanName: dna.clanName ?? '',
    mascot: dna.mascot ?? '',
    primaryColors: dna.primaryColors ?? [],
    secondaryColors: dna.secondaryColors ?? [],
    accentColors: dna.accentColors ?? [],
    backgroundColors: dna.backgroundColors ?? [],
    styleDirection: dna.styleDirection,
    favoriteGenres: dna.favoriteGenres ?? [],
    gamingStyle: dna.gamingStyle ?? '',
    brandingStyle: dna.brandingStyle ?? '',
    promptStyle: dna.promptStyle ?? '',
    visualLanguage: dna.visualLanguage ?? '',
    animations: dna.animations ?? [],
    personalGuidelines: dna.personalGuidelines ?? '',
    fonts: dna.fonts ?? [],
    brandingRules: dna.brandingRules ?? [],
    platformOptimization: dna.platformOptimization ?? [],
    targetAudience: dna.targetAudience,
    designLanguage: dna.designLanguage,
    sourceAssets: sanitizeDnaSourceAssets(dna.sourceAssets),
    locks: dna.locks ?? {},
    lightingStyle: dna.lightingStyle ?? '',
    dimension: dna.dimension ?? '',
    projectId: dna.projectId ?? '',
    slogan: dna.slogan ?? '',
    usagePurpose: dna.usagePurpose ?? '',
    character: dna.character ?? null,
    typography: dna.typography ?? null,
    atmosphere: dna.atmosphere ?? null,
    outputPrefs: dna.outputPrefs ?? null,
    schemaVersion: dna.schemaVersion ?? 1,
    ...v2,
  });
}
