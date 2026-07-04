/** Ultimate Creator OS — Projekt & Pack Typen */

export type UltimateProjectStatus = 'draft' | 'generating' | 'ready' | 'partial' | 'exported' | 'archived';

export type UltimatePlatformId = 'twitch' | 'youtube' | 'tiktok' | 'discord' | 'kick';

export interface UltimateCreatorWizardInput {
  name: string;
  clanName?: string;
  game?: string;
  style: string;
  colors: string[];
  platforms: UltimatePlatformId[];
}

export interface UltimatePackAsset {
  id: string;
  key: string;
  label: string;
  module: string;
  jobId?: string;
  imageUrl?: string;
  status: 'pending' | 'completed' | 'failed';
  version: number;
  createdAt: string;
}

export interface UltimateCreatorProject {
  id: string;
  userId: string;
  name: string;
  status: UltimateProjectStatus;
  version: number;
  wizard: UltimateCreatorWizardInput;
  tags: string[];
  platforms: UltimatePlatformId[];
  styleToken: string;
  dnaId?: string;
  logoJobIds: string[];
  logoImageUrl?: string;
  assets: UltimatePackAsset[];
  aiHistory: UltimateAiAction[];
  exportStatus: Partial<Record<UltimatePlatformId, 'pending' | 'done'>>;
  previewThumbnail?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UltimateAiAction {
  id: string;
  intent: string;
  summary: string;
  createdAt: string;
}

export type ImprovementIntentId =
  | 'more-depth'
  | 'more-realism'
  | 'better-colors'
  | 'more-detail'
  | 'cinematic-light'
  | 'premium-materials'
  | 'sharper-edges'
  | 'horror'
  | 'anime'
  | 'neon'
  | 'aggressive';

export interface ImprovementPreset {
  id: ImprovementIntentId;
  label: string;
  description: string;
  magikStyle?: string;
  magikLogoArt?: '2d' | '3d' | 'ultra-3d' | 'ultra-cinematic-3d';
  promptSuffix: string;
}
