export type DnaSourceType = 'name' | 'logo' | 'graphic';

export interface BrandFonts {
  heading: string;
  body: string;
  accent: string;
}

export interface DnaExtractedFrom {
  type: DnaSourceType;
  sourceRef?: string;
}

export interface SavedStyleProfile {
  id: string;
  name: string;
  brandingStyle: string;
  primaryColors: string[];
  accentColors: string[];
  glowStrength: number;
  neonStrength: number;
  savedAt: string;
}

export interface BrandDNA {
  id: string;
  projectId: string;
  version: number;
  primaryColors: string[];
  secondaryColors: string[];
  accentColors: string[];
  fonts: BrandFonts;
  logoShapes: string[];
  characters: string[];
  symbols: string[];
  glowStrength: number;
  neonStrength: number;
  lightBehavior: string;
  textureBehavior: string;
  brandingStyle: string;
  platformPreferences: string[];
  styleLocked: boolean;
  savedStyleProfiles?: SavedStyleProfile[];
  activeStyleProfileId?: string;
  extractedFrom?: DnaExtractedFrom;
  niche?: string;
  visualStyle?: string;
  clanName?: string;
  targetAudience?: string;
  effectStyle?: string;
  threeDStyle?: string;
  animationStyle?: string;
  brandDnaSummary?: string;
  createdAt: string;
  updatedAt: string;
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createDefaultDNA(projectId: string, name?: string): BrandDNA {
  const now = new Date().toISOString();
  return {
    id: newId(),
    projectId,
    version: 1,
    primaryColors: ['#FF2D95', '#00F5FF', '#B24BFF'],
    secondaryColors: ['#1a1a2e', '#16213e'],
    accentColors: ['#00F5FF', '#FF2D95'],
    fonts: { heading: 'Orbitron', body: 'Inter', accent: 'Orbitron' },
    logoShapes: ['geometric', 'angular'],
    characters: name ? [`${name} mascot`] : ['gaming mascot'],
    symbols: ['lightning', 'crown', 'star'],
    glowStrength: 0.8,
    neonStrength: 0.9,
    lightBehavior: 'neon rim light, soft ambient glow',
    textureBehavior: 'glassy, subtle grain, esports premium',
    brandingStyle: 'gaming esports premium neon glasmorphism',
    platformPreferences: ['twitch', 'youtube'],
    styleLocked: false,
    savedStyleProfiles: [],
    extractedFrom: name ? { type: 'name', sourceRef: name } : undefined,
    createdAt: now,
    updatedAt: now,
  };
}
