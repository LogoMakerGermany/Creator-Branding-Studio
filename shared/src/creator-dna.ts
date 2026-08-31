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
  /** Locked traits must not be changed by generators or Nexter. */
  locks?: DnaLocks;
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
  'instagram',
  'discord',
  'facebook',
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
  url: string;
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
  }
  if (still('character') || still('mascot')) {
    if (incoming.mascot !== undefined) out.mascot = existing.mascot;
    if (incoming.character !== undefined) out.character = existing.character;
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
export function buildDnaPromptContext(dna: CreatorDNA): string {
  const colors = [
    ...dna.primaryColors,
    ...dna.secondaryColors,
    ...dna.accentColors,
    ...(dna.backgroundColors ?? []),
  ]
    .filter(Boolean)
    .slice(0, 8);
  const fonts = dna.fonts.map((f) => `${f.name} (${f.role})`).filter(Boolean);
  const platforms = dna.platformOptimization.map((p) => p.platform);
  const rules = dna.brandingRules
    .filter((r) => r.priority === 'required')
    .map((r) => r.rule)
    .slice(0, 4);
  const character = characterPromptFromDna(dna);

  const parts = [
    `Creator: ${dna.name}`,
    dna.slogan ? `Slogan: ${dna.slogan}` : null,
    dna.usagePurpose ? `Usage: ${dna.usagePurpose}` : null,
    dna.clanName ? `Clan: ${dna.clanName}` : null,
    dna.mascot ? `Mascot: ${dna.mascot}` : null,
    character ? `Character: ${character}` : null,
    `Style: ${dna.styleDirection}`,
    dna.dimension ? `Dimension: ${dna.dimension}` : null,
    dna.brandingStyle ? `Branding style: ${dna.brandingStyle}` : null,
    dna.gamingStyle ? `Gaming style: ${dna.gamingStyle}` : null,
    dna.promptStyle ? `Prompt style: ${dna.promptStyle}` : null,
    dna.visualLanguage ? `Visual language: ${dna.visualLanguage}` : null,
    colors.length ? `Colors: ${colors.join(', ')}` : null,
    fonts.length ? `Fonts: ${fonts.join(', ')}` : null,
    dna.typography?.character ? `Typography: ${dna.typography.character}` : null,
    dna.typography?.nameTreatment ? `Name treatment: ${dna.typography.nameTreatment}` : null,
    dna.favoriteGenres?.length ? `Genres: ${dna.favoriteGenres.join(', ')}` : null,
    platforms.length ? `Platforms: ${platforms.join(', ')}` : null,
    dna.outputPrefs?.platform ? `Preferred platform: ${dna.outputPrefs.platform}` : null,
    dna.outputPrefs?.aspectRatios?.length
      ? `Aspect ratios: ${dna.outputPrefs.aspectRatios.join(', ')}`
      : null,
    dna.animations?.length ? `Animations: ${dna.animations.join(', ')}` : null,
    dna.personalGuidelines ? `Guidelines: ${dna.personalGuidelines}` : null,
    dna.designLanguage?.mood?.length ? `Mood: ${dna.designLanguage.mood.join(', ')}` : null,
    dna.atmosphere?.lighting ? `Atmosphere lighting: ${dna.atmosphere.lighting}` : null,
    dna.atmosphere?.mood ? `Atmosphere mood: ${dna.atmosphere.mood}` : null,
    dna.atmosphere?.effects?.length ? `Effects: ${dna.atmosphere.effects.join(', ')}` : null,
    dna.designLanguage?.doNotUse?.length
      ? `Avoid: ${dna.designLanguage.doNotUse.join(', ')}`
      : null,
    dna.lightingStyle ? `Lighting: ${dna.lightingStyle}` : null,
    dna.locks?.name ? 'LOCKED: do not change the creator/brand name' : null,
    dna.locks?.colors ? 'LOCKED: do not change brand colors' : null,
    isCharacterLocked(dna) ? 'LOCKED: keep the mascot/character unchanged' : null,
    dna.locks?.style ? 'LOCKED: keep the visual style unchanged' : null,
    isTypographyLocked(dna) ? 'LOCKED: keep typography unchanged' : null,
    rules.length ? `Rules: ${rules.join('; ')}` : null,
  ].filter(Boolean);

  return parts.join('. ') + '.';
}

export interface LogoLockPatch {
  logoName?: string;
  primaryColor?: string;
  selectedColors?: string[];
  magikCharacter?: string;
}

/** Generators must not silently replace locked DNA traits. */
export function applyLockedDnaToGeneration<T extends LogoLockPatch>(dna: CreatorDNA, opts: T): T {
  const out = { ...opts };
  if (dna.locks?.name) out.logoName = dna.name;
  if (dna.locks?.colors) {
    if (dna.primaryColors.length) {
      out.selectedColors = dna.primaryColors;
      out.primaryColor = dna.primaryColors[0];
    }
  }
  if (isCharacterLocked(dna)) {
    const phrase = dna.character?.description || dna.mascot;
    if (phrase) out.magikCharacter = phrase;
  }
  return out;
}
