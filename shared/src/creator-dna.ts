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
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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

export interface DNAAnalysis {
  colorPalette: { hex: string; name: string; usage: string }[];
  detectedStyle: StyleDirection;
  confidence: number;
  suggestions: string[];
  analyzedAt: string;
  /** true when OpenAI Vision was used; false for color-only extraction */
  source: 'vision' | 'colors';
}

export interface DNAVersion {
  id: string;
  dnaId: string;
  version: number;
  snapshot: CreatorDNA;
  changeDescription?: string;
  createdAt: string;
}

/** Compact DNA fragment for every AI prompt — generators must append this. */
export function buildDnaPromptContext(dna: CreatorDNA): string {
  const colors = [...dna.primaryColors, ...dna.secondaryColors, ...dna.accentColors]
    .filter(Boolean)
    .slice(0, 6);
  const fonts = dna.fonts.map((f) => `${f.name} (${f.role})`).filter(Boolean);
  const platforms = dna.platformOptimization.map((p) => p.platform);
  const rules = dna.brandingRules
    .filter((r) => r.priority === 'required')
    .map((r) => r.rule)
    .slice(0, 4);

  const parts = [
    `Creator: ${dna.name}`,
    dna.clanName ? `Clan: ${dna.clanName}` : null,
    dna.mascot ? `Mascot: ${dna.mascot}` : null,
    `Style: ${dna.styleDirection}`,
    dna.brandingStyle ? `Branding style: ${dna.brandingStyle}` : null,
    dna.gamingStyle ? `Gaming style: ${dna.gamingStyle}` : null,
    dna.promptStyle ? `Prompt style: ${dna.promptStyle}` : null,
    dna.visualLanguage ? `Visual language: ${dna.visualLanguage}` : null,
    colors.length ? `Colors: ${colors.join(', ')}` : null,
    fonts.length ? `Fonts: ${fonts.join(', ')}` : null,
    dna.favoriteGenres?.length ? `Genres: ${dna.favoriteGenres.join(', ')}` : null,
    platforms.length ? `Platforms: ${platforms.join(', ')}` : null,
    dna.animations?.length ? `Animations: ${dna.animations.join(', ')}` : null,
    dna.personalGuidelines ? `Guidelines: ${dna.personalGuidelines}` : null,
    dna.designLanguage?.mood?.length ? `Mood: ${dna.designLanguage.mood.join(', ')}` : null,
    dna.designLanguage?.doNotUse?.length
      ? `Avoid: ${dna.designLanguage.doNotUse.join(', ')}`
      : null,
    rules.length ? `Rules: ${rules.join('; ')}` : null,
  ].filter(Boolean);

  return parts.join('. ') + '.';
}
