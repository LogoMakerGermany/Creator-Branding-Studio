import type { AssetType } from './assets.js';
import type { BrandFonts } from './dna.js';
import {
  getStreamSetConfig,
  STREAM_SET_PLATFORM_LABELS,
  type StreamSetPlatform,
  type WizardPayload,
  suggestColorsForWizard,
  buildBrandingStyleFromWizard,
} from './streamSets.js';

export type BrandingCategory =
  | 'logo'
  | 'banner'
  | 'streaming'
  | 'social'
  | 'extras';

export type BrandingZipFolder =
  | 'Logo'
  | 'Banner'
  | 'Overlay'
  | 'Facecam'
  | 'Sticker'
  | 'Intro'
  | 'Outro'
  | 'SocialMedia';

export interface BrandingAssetPlanItem {
  id: string;
  category: BrandingCategory;
  assetType: AssetType;
  slot: string;
  label: string;
  exportName: string;
  width: number;
  height: number;
  transparent: boolean;
  coinCost: number;
  enabled: boolean;
  estimatedSeconds: number;
  zipFolder: BrandingZipFolder;
}

export interface BrandDnaAnalysis {
  brandDnaSummary: string;
  colorPalette: {
    primary: string[];
    secondary: string[];
    accent: string[];
  };
  fonts: BrandFonts;
  effectStyle: string;
  lightStyle: string;
  threeDStyle: string;
  animationStyle: string;
  targetAudience: string;
  inputs: {
    creatorName: string;
    clanName?: string;
    platform: StreamSetPlatform;
    niche: string;
    visualStyle: string;
  };
}

export interface BrandingPreview {
  platform: StreamSetPlatform;
  label: string;
  analysis: BrandDnaAnalysis;
  assets: BrandingAssetPlanItem[];
  totalCoins: number;
  enabledCount: number;
  estimatedSeconds: number;
  estimatedMinutes: number;
}

export interface QcCheckResult {
  slot: string;
  label: string;
  passed: boolean;
  checks: { name: string; passed: boolean; detail?: string }[];
}

export interface QcReport {
  passed: boolean;
  checks: QcCheckResult[];
  summary: string;
  completedAt: string;
}

const LOGO_COST = 5;
const BANNER_COST = 10;
const OVERLAY_COST = 10;
const FACECAM_COST = 5;
const PANEL_COST = 4;
const OFFLINE_COST = 8;
const STICKER_COST = 2;
const INTRO_COST = 15;
const OUTRO_COST = 10;
const STREAM_SCREEN_COST = 8;
const SOCIAL_COST = 6;

function estimateSeconds(assetType: AssetType): number {
  if (assetType === 'intro' || assetType === 'outro' || assetType === 'stinger') return 45;
  if (assetType === 'sticker') return 8;
  return 12;
}

function zipFolderFor(item: { assetType: AssetType; slot: string; category: BrandingCategory }): BrandingZipFolder {
  if (item.category === 'logo' || item.assetType === 'logo') return 'Logo';
  if (item.category === 'banner' || item.assetType === 'banner' || item.assetType === 'wallpaper') return 'Banner';
  if (item.assetType === 'facecam') return 'Facecam';
  if (item.assetType === 'sticker') return 'Sticker';
  if (item.assetType === 'intro') return 'Intro';
  if (item.assetType === 'outro') return 'Outro';
  if (item.category === 'social') return 'SocialMedia';
  return 'Overlay';
}

function planItem(
  platform: StreamSetPlatform,
  partial: Omit<BrandingAssetPlanItem, 'estimatedSeconds' | 'zipFolder' | 'enabled'>,
): BrandingAssetPlanItem {
  return {
    ...partial,
    enabled: true,
    estimatedSeconds: estimateSeconds(partial.assetType),
    zipFolder: zipFolderFor(partial),
  };
}

function logoBlock(platform: StreamSetPlatform): BrandingAssetPlanItem[] {
  const label = STREAM_SET_PLATFORM_LABELS[platform];
  const size = platform === 'discord' ? 512 : 1024;
  return [
    planItem(platform, {
      id: 'logo_main',
      category: 'logo',
      assetType: 'logo',
      slot: 'logo_main',
      label: 'Hauptlogo',
      exportName: `${label}_Logo_Main.png`,
      width: size,
      height: size,
      transparent: true,
      coinCost: LOGO_COST,
    }),
    planItem(platform, {
      id: 'logo_alt',
      category: 'logo',
      assetType: 'logo',
      slot: 'logo_alt',
      label: 'Alternative Logo Version',
      exportName: `${label}_Logo_Alt.png`,
      width: size,
      height: size,
      transparent: true,
      coinCost: LOGO_COST,
    }),
    planItem(platform, {
      id: 'logo_minimal',
      category: 'logo',
      assetType: 'logo',
      slot: 'logo_minimal',
      label: 'Minimal Logo Version',
      exportName: `${label}_Logo_Minimal.png`,
      width: size,
      height: size,
      transparent: true,
      coinCost: LOGO_COST,
    }),
  ];
}

function socialBlock(platform: StreamSetPlatform): BrandingAssetPlanItem[] {
  const label = STREAM_SET_PLATFORM_LABELS[platform];
  return [
    planItem(platform, {
      id: 'social_profile',
      category: 'social',
      assetType: 'logo',
      slot: 'social_profile',
      label: 'Profilbild',
      exportName: `${label}_Social_Profile.png`,
      width: 400,
      height: 400,
      transparent: true,
      coinCost: SOCIAL_COST,
    }),
    planItem(platform, {
      id: 'social_story',
      category: 'social',
      assetType: 'wallpaper',
      slot: 'social_story',
      label: 'Story Cover',
      exportName: `${label}_Social_Story.png`,
      width: 1080,
      height: 1920,
      transparent: false,
      coinCost: SOCIAL_COST,
    }),
    planItem(platform, {
      id: 'social_post',
      category: 'social',
      assetType: 'social',
      slot: 'social_post',
      label: 'Post Cover',
      exportName: `${label}_Social_Post.png`,
      width: 1080,
      height: 1080,
      transparent: false,
      coinCost: SOCIAL_COST,
    }),
  ];
}

function streamScreensBlock(platform: StreamSetPlatform): BrandingAssetPlanItem[] {
  const label = STREAM_SET_PLATFORM_LABELS[platform];
  const w = platform === 'tiktok' ? 1080 : 1920;
  const h = platform === 'tiktok' ? 1920 : 1080;
  return [
    planItem(platform, {
      id: 'starting_soon',
      category: 'extras',
      assetType: 'starting_soon',
      slot: 'starting_soon',
      label: 'Stream Startet Bald',
      exportName: `${label}_StartingSoon.png`,
      width: w,
      height: h,
      transparent: false,
      coinCost: STREAM_SCREEN_COST,
    }),
    planItem(platform, {
      id: 'brb',
      category: 'extras',
      assetType: 'brb',
      slot: 'brb',
      label: 'Bin Gleich Zurück',
      exportName: `${label}_BRB.png`,
      width: w,
      height: h,
      transparent: false,
      coinCost: STREAM_SCREEN_COST,
    }),
    planItem(platform, {
      id: 'ending',
      category: 'extras',
      assetType: 'ending',
      slot: 'ending',
      label: 'Stream Ende',
      exportName: `${label}_StreamEnde.png`,
      width: w,
      height: h,
      transparent: false,
      coinCost: STREAM_SCREEN_COST,
    }),
  ];
}

function fromStreamSpec(
  platform: StreamSetPlatform,
  spec: ReturnType<typeof getStreamSetConfig>['assets'][number],
): BrandingAssetPlanItem {
  let category: BrandingCategory = 'streaming';
  if (spec.assetType === 'logo') category = 'logo';
  else if (spec.assetType === 'banner' || spec.assetType === 'wallpaper' || spec.assetType === 'thumbnail') {
    category = 'banner';
  } else if (spec.assetType === 'sticker' || spec.assetType === 'intro' || spec.assetType === 'outro') {
    category = 'extras';
  }

  return planItem(platform, {
    id: spec.slot,
    category,
    assetType: spec.assetType,
    slot: spec.slot,
    label: spec.label,
    exportName: spec.exportName,
    width: spec.width,
    height: spec.height,
    transparent: spec.transparent,
    coinCost: spec.coinCost,
  });
}

export function buildBrandingAssetPlan(platform: string): BrandingAssetPlanItem[] {
  const key = (platform as StreamSetPlatform) in STREAM_SET_PLATFORM_LABELS
    ? (platform as StreamSetPlatform)
    : 'tiktok';
  const config = getStreamSetConfig(key);
  const seen = new Set<string>();
  const items: BrandingAssetPlanItem[] = [];

  const push = (item: BrandingAssetPlanItem) => {
    if (seen.has(item.slot)) return;
    seen.add(item.slot);
    items.push(item);
  };

  for (const logo of logoBlock(key)) push(logo);
  for (const spec of config.assets) push(fromStreamSpec(key, spec));

  if (!seen.has('community_banner')) {
    push(planItem(key, {
      id: 'community_banner',
      category: 'banner',
      assetType: 'wallpaper',
      slot: 'community_banner',
      label: 'Community Banner',
      exportName: `${STREAM_SET_PLATFORM_LABELS[key]}_CommunityBanner.png`,
      width: 1920,
      height: 1080,
      transparent: false,
      coinCost: BANNER_COST,
    }));
  }

  if (!seen.has('facecam')) {
    push(planItem(key, {
      id: 'facecam',
      category: 'streaming',
      assetType: 'facecam',
      slot: 'facecam',
      label: 'Facecam Rahmen',
      exportName: `${STREAM_SET_PLATFORM_LABELS[key]}_Facecam.png`,
      width: 640,
      height: 360,
      transparent: true,
      coinCost: FACECAM_COST,
    }));
  }
  if (!seen.has('overlay')) {
    push(planItem(key, {
      id: 'overlay',
      category: 'streaming',
      assetType: 'overlay',
      slot: 'overlay',
      label: 'Overlay',
      exportName: `${STREAM_SET_PLATFORM_LABELS[key]}_Overlay.png`,
      width: key === 'tiktok' ? 1080 : 1920,
      height: key === 'tiktok' ? 1920 : 1080,
      transparent: true,
      coinCost: OVERLAY_COST,
    }));
  }
  if (!seen.has('offline')) {
    push(planItem(key, {
      id: 'offline',
      category: 'streaming',
      assetType: 'offline',
      slot: 'offline',
      label: 'Offline Screen',
      exportName: `${STREAM_SET_PLATFORM_LABELS[key]}_OfflineScreen.png`,
      width: key === 'tiktok' ? 1080 : 1920,
      height: key === 'tiktok' ? 1920 : 1080,
      transparent: false,
      coinCost: OFFLINE_COST,
    }));
  }
  if (!seen.has('panel')) {
    push(planItem(key, {
      id: 'panel',
      category: 'streaming',
      assetType: 'panel',
      slot: 'panel',
      label: 'Panel',
      exportName: `${STREAM_SET_PLATFORM_LABELS[key]}_Panel.png`,
      width: 320,
      height: 100,
      transparent: true,
      coinCost: PANEL_COST,
    }));
  }

  for (const social of socialBlock(key)) push(social);
  for (const screen of streamScreensBlock(key)) push(screen);

  if (!seen.has('intro')) {
    push(planItem(key, {
      id: 'intro',
      category: 'extras',
      assetType: 'intro',
      slot: 'intro',
      label: 'Intro',
      exportName: `${STREAM_SET_PLATFORM_LABELS[key]}_Intro.mp4`,
      width: key === 'tiktok' ? 1080 : 1920,
      height: key === 'tiktok' ? 1920 : 1080,
      transparent: false,
      coinCost: INTRO_COST,
    }));
  }
  if (!seen.has('outro')) {
    push(planItem(key, {
      id: 'outro',
      category: 'extras',
      assetType: 'outro',
      slot: 'outro',
      label: 'Outro',
      exportName: `${STREAM_SET_PLATFORM_LABELS[key]}_Outro.mp4`,
      width: key === 'tiktok' ? 1080 : 1920,
      height: key === 'tiktok' ? 1920 : 1080,
      transparent: false,
      coinCost: OUTRO_COST,
    }));
  }

  const stickerCount = config.stickerCount || 5;
  for (let i = 0; i < stickerCount; i++) {
    const slot = `sticker_${i + 1}`;
    if (!seen.has(slot)) {
      push(planItem(key, {
        id: slot,
        category: 'extras',
        assetType: 'sticker',
        slot,
        label: `Sticker ${i + 1}`,
        exportName: `${STREAM_SET_PLATFORM_LABELS[key]}_Sticker${String(i + 1).padStart(2, '0')}.png`,
        width: key === 'discord' ? 320 : 512,
        height: key === 'discord' ? 320 : 512,
        transparent: true,
        coinCost: STICKER_COST,
      }));
    }
  }

  return items;
}

export function getBrandingAssetSpec(platform: string, slot: string): BrandingAssetPlanItem | null {
  return buildBrandingAssetPlan(platform).find(a => a.slot === slot) ?? null;
}

export function buildBrandingExportName(
  platform: string,
  slot: string,
  stickerIndex?: number,
): string | null {
  if (slot.startsWith('sticker_') && stickerIndex !== undefined) {
    const key = platform as StreamSetPlatform;
    return `${STREAM_SET_PLATFORM_LABELS[key]}_Sticker${String(stickerIndex + 1).padStart(2, '0')}.png`;
  }
  return getBrandingAssetSpec(platform, slot)?.exportName ?? null;
}

export function filterBrandingPlan(
  platform: string,
  enabledSlots?: string[],
): BrandingAssetPlanItem[] {
  const plan = buildBrandingAssetPlan(platform);
  if (!enabledSlots?.length) return plan;
  const set = new Set(enabledSlots);
  return plan.map(a => ({ ...a, enabled: set.has(a.slot) }));
}

export function selectBrandingPlanForGeneration(
  platform: string,
  enabledSlots?: string[],
): BrandingAssetPlanItem[] {
  return filterBrandingPlan(platform, enabledSlots).filter(a => a.enabled);
}

export function calculateBrandingPlanCost(items: BrandingAssetPlanItem[]): number {
  return items.filter(a => a.enabled).reduce((sum, a) => sum + a.coinCost, 0);
}

export function estimateBrandingGenerationSeconds(items: BrandingAssetPlanItem[]): number {
  return items.filter(a => a.enabled).reduce((sum, a) => sum + a.estimatedSeconds, 0);
}

function pickFonts(style: string): BrandFonts {
  const map: Record<string, BrandFonts> = {
    Anime: { heading: 'Bangers', body: 'Nunito', accent: 'Bangers' },
    Cyberpunk: { heading: 'Orbitron', body: 'Rajdhani', accent: 'Orbitron' },
    Minimalistisch: { heading: 'Montserrat', body: 'Inter', accent: 'Montserrat' },
    Techno: { heading: 'Audiowide', body: 'Roboto', accent: 'Audiowide' },
    'Ultra Cinematic 3D': { heading: 'Bebas Neue', body: 'Inter', accent: 'Bebas Neue' },
  };
  return map[style] ?? { heading: 'Orbitron', body: 'Inter', accent: 'Orbitron' };
}

function targetAudienceFor(niche: string, platform: StreamSetPlatform): string {
  const platformAudiences: Record<StreamSetPlatform, string> = {
    tiktok: 'Gen Z & Mobile-First Creator-Fans',
    twitch: 'Live-Streaming Community & Gaming-Fans',
    youtube: 'Video-Abonnenten & Longform-Viewer',
    kick: 'Competitive Streaming & Esports-Fans',
    discord: 'Community-Mitglieder & Clan-Teams',
  };
  return `${niche}-Interessierte, ${platformAudiences[platform]}`;
}

export function analyzeBrandDna(wizard: WizardPayload): BrandDnaAnalysis {
  const suggested = wizard.useDefaultColors !== false && (!wizard.primaryColors?.length)
    ? suggestColorsForWizard(wizard.niche, wizard.visualStyle)
    : null;

  const primary = wizard.primaryColors?.length ? wizard.primaryColors : suggested?.primary ?? ['#FF2D95', '#00F5FF'];
  const accent = wizard.accentColors?.length ? wizard.accentColors : suggested?.accent ?? ['#00F5FF', '#FF2D95'];
  const brandingStyle = buildBrandingStyleFromWizard(wizard);

  return {
    brandDnaSummary: [
      `${wizard.creatorName} – ${wizard.niche} Creator auf ${STREAM_SET_PLATFORM_LABELS[wizard.platform]}.`,
      wizard.clanName ? `Clan-Identität: ${wizard.clanName}.` : '',
      `Visueller Stil: ${wizard.visualStyle}.`,
      wizard.slogan ? `Mood: ${wizard.slogan}.` : '',
    ].filter(Boolean).join(' '),
    colorPalette: {
      primary,
      secondary: ['#1a1a2e', '#16213e'],
      accent,
    },
    fonts: pickFonts(wizard.visualStyle),
    effectStyle: `${wizard.visualStyle} neon glow, glassmorphism, particle accents`,
    lightStyle: wizard.visualStyle === 'Minimalistisch'
      ? 'soft ambient light, clean highlights'
      : 'neon rim light, volumetric glow, cinematic contrast',
    threeDStyle: wizard.visualStyle === 'Ultra Cinematic 3D'
      ? 'hyper-real 3D renders, depth of field, metallic accents'
      : 'subtle 3D depth, beveled edges, premium esports look',
    animationStyle: wizard.visualStyle === 'Anime'
      ? 'dynamic motion graphics, punchy transitions'
      : 'smooth neon reveals, glitch accents, stream-ready loops',
    targetAudience: targetAudienceFor(wizard.niche, wizard.platform),
    inputs: {
      creatorName: wizard.creatorName,
      clanName: wizard.clanName,
      platform: wizard.platform,
      niche: wizard.niche,
      visualStyle: wizard.visualStyle,
    },
  };
}

export function buildBrandingPreview(
  wizard: WizardPayload,
  enabledSlots?: string[],
): BrandingPreview {
  const analysis = analyzeBrandDna(wizard);
  const allAssets = buildBrandingAssetPlan(wizard.platform);
  const assets = enabledSlots?.length
    ? allAssets.map(a => ({ ...a, enabled: new Set(enabledSlots).has(a.slot) }))
    : allAssets;
  const active = assets.filter(a => a.enabled);
  const estimatedSeconds = estimateBrandingGenerationSeconds(active);
  const config = getStreamSetConfig(wizard.platform);

  return {
    platform: wizard.platform,
    label: config.label,
    analysis,
    assets,
    totalCoins: calculateBrandingPlanCost(active),
    enabledCount: active.length,
    estimatedSeconds,
    estimatedMinutes: Math.max(1, Math.ceil(estimatedSeconds / 60)),
  };
}

export function sanitizeBrandingZipName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/_+/g, '_') || 'Creator';
}
