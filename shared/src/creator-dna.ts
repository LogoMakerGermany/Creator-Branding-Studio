export interface CreatorDNA {
  id: string;
  userId: string;
  name: string;
  type: DNAType;
  primaryColors: string[];
  secondaryColors: string[];
  accentColors: string[];
  styleDirection: StyleDirection;
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
  platform: 'twitch' | 'youtube' | 'tiktok' | 'instagram' | 'discord' | 'facebook';
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
}

export interface DNAVersion {
  id: string;
  dnaId: string;
  version: number;
  snapshot: CreatorDNA;
  changeDescription?: string;
  createdAt: string;
}
