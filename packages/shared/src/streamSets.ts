import type { AssetType } from './assets.js';

export type StreamSetPlatform = 'tiktok' | 'twitch' | 'youtube' | 'kick' | 'discord';

export const STREAM_SET_PLATFORMS: StreamSetPlatform[] = [
  'tiktok',
  'twitch',
  'youtube',
  'kick',
  'discord',
];

export const STREAM_SET_PLATFORM_LABELS: Record<StreamSetPlatform, string> = {
  tiktok: 'TikTok',
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick',
  discord: 'Discord',
};

export const CREATOR_NICHES = [
  'Gaming',
  'Streaming',
  'Musik',
  'DJ',
  'Podcast',
  'Community',
  'Esports',
  'Lifestyle',
  'Technik',
  'Sonstiges',
] as const;

export type CreatorNiche = (typeof CREATOR_NICHES)[number];

export const VISUAL_STYLES = [
  'Esports',
  'Call of Duty',
  'Fortnite',
  'Anime',
  'Cyberpunk',
  'Techno',
  'Hardstyle',
  'Minimalistisch',
  'Realistisch',
  'Ultra Cinematic 3D',
] as const;

export type VisualStyle = (typeof VISUAL_STYLES)[number];

export interface StreamSetAssetSpec {
  assetType: AssetType;
  slot: string;
  label: string;
  exportName: string;
  width: number;
  height: number;
  transparent: boolean;
  coinCost: number;
}

export interface StreamSetPlatformConfig {
  platform: StreamSetPlatform;
  label: string;
  assets: StreamSetAssetSpec[];
  stickerCount: number;
}

const STICKER_COST = 2;

function stickerSpecs(platform: StreamSetPlatform, count: number): StreamSetAssetSpec[] {
  return Array.from({ length: count }, (_, i) => ({
    assetType: 'sticker',
    slot: `sticker_${i + 1}`,
    label: `Sticker ${i + 1}`,
    exportName: `${STREAM_SET_PLATFORM_LABELS[platform]}_Sticker${String(i + 1).padStart(2, '0')}.png`,
    width: platform === 'discord' ? 320 : 512,
    height: platform === 'discord' ? 320 : 512,
    transparent: true,
    coinCost: STICKER_COST,
  }));
}

export const STREAM_SET_CONFIGS: Record<StreamSetPlatform, StreamSetPlatformConfig> = {
  tiktok: {
    platform: 'tiktok',
    label: 'TikTok',
    stickerCount: 5,
    assets: [
      { assetType: 'logo', slot: 'profile', label: 'Profilbild', exportName: 'TikTok_Profile.png', width: 400, height: 400, transparent: true, coinCost: 5 },
      { assetType: 'thumbnail', slot: 'video_cover', label: 'Video Cover', exportName: 'TikTok_VideoCover.png', width: 1080, height: 1920, transparent: false, coinCost: 10 },
      { assetType: 'offline', slot: 'live_cover', label: 'Live Cover', exportName: 'TikTok_LiveCover.png', width: 1080, height: 1920, transparent: false, coinCost: 10 },
      { assetType: 'overlay', slot: 'overlay', label: 'Overlay', exportName: 'TikTok_Overlay.png', width: 1080, height: 1920, transparent: true, coinCost: 10 },
      { assetType: 'intro', slot: 'intro', label: 'Intro', exportName: 'TikTok_Intro.mp4', width: 1080, height: 1920, transparent: false, coinCost: 15 },
      { assetType: 'outro', slot: 'outro', label: 'Outro', exportName: 'TikTok_Outro.mp4', width: 1080, height: 1920, transparent: false, coinCost: 10 },
      ...stickerSpecs('tiktok', 5),
    ],
  },
  twitch: {
    platform: 'twitch',
    label: 'Twitch',
    stickerCount: 5,
    assets: [
      { assetType: 'logo', slot: 'logo', label: 'Logo', exportName: 'Twitch_Logo.png', width: 1024, height: 1024, transparent: true, coinCost: 5 },
      { assetType: 'banner', slot: 'banner', label: 'Banner', exportName: 'Twitch_Banner.png', width: 1920, height: 480, transparent: false, coinCost: 10 },
      { assetType: 'overlay', slot: 'overlay', label: 'Overlay', exportName: 'Twitch_Overlay.png', width: 1920, height: 1080, transparent: true, coinCost: 10 },
      { assetType: 'facecam', slot: 'facecam', label: 'Facecam', exportName: 'Twitch_Facecam.png', width: 640, height: 360, transparent: true, coinCost: 5 },
      { assetType: 'panel', slot: 'panel', label: 'Panel', exportName: 'Twitch_Panel.png', width: 320, height: 100, transparent: true, coinCost: 4 },
      { assetType: 'offline', slot: 'offline', label: 'Offline Screen', exportName: 'Twitch_OfflineScreen.png', width: 1920, height: 1080, transparent: false, coinCost: 8 },
      { assetType: 'intro', slot: 'intro', label: 'Intro', exportName: 'Twitch_Intro.mp4', width: 1920, height: 1080, transparent: false, coinCost: 15 },
      { assetType: 'outro', slot: 'outro', label: 'Outro', exportName: 'Twitch_Outro.mp4', width: 1920, height: 1080, transparent: false, coinCost: 10 },
      { assetType: 'stinger', slot: 'stinger', label: 'Stinger', exportName: 'Twitch_Stinger.mp4', width: 1920, height: 1080, transparent: false, coinCost: 12 },
      ...stickerSpecs('twitch', 5),
    ],
  },
  youtube: {
    platform: 'youtube',
    label: 'YouTube',
    stickerCount: 0,
    assets: [
      { assetType: 'banner', slot: 'banner', label: 'Banner', exportName: 'YouTube_Banner.png', width: 2560, height: 1440, transparent: false, coinCost: 10 },
      { assetType: 'thumbnail', slot: 'thumbnail', label: 'Thumbnail', exportName: 'YouTube_Thumbnail.png', width: 1280, height: 720, transparent: false, coinCost: 6 },
      { assetType: 'wallpaper', slot: 'shorts_cover', label: 'Shorts Cover', exportName: 'YouTube_ShortsCover.png', width: 1080, height: 1920, transparent: false, coinCost: 10 },
      { assetType: 'intro', slot: 'intro', label: 'Intro', exportName: 'YouTube_Intro.mp4', width: 1920, height: 1080, transparent: false, coinCost: 15 },
      { assetType: 'outro', slot: 'outro', label: 'Outro', exportName: 'YouTube_Outro.mp4', width: 1920, height: 1080, transparent: false, coinCost: 10 },
      { assetType: 'overlay', slot: 'overlay', label: 'Overlay', exportName: 'YouTube_Overlay.png', width: 1920, height: 1080, transparent: true, coinCost: 10 },
    ],
  },
  kick: {
    platform: 'kick',
    label: 'Kick',
    stickerCount: 0,
    assets: [
      { assetType: 'banner', slot: 'banner', label: 'Banner', exportName: 'Kick_Banner.png', width: 1920, height: 480, transparent: false, coinCost: 10 },
      { assetType: 'offline', slot: 'offline', label: 'Offline Screen', exportName: 'Kick_OfflineScreen.png', width: 1920, height: 1080, transparent: false, coinCost: 8 },
      { assetType: 'facecam', slot: 'facecam', label: 'Facecam', exportName: 'Kick_Facecam.png', width: 640, height: 360, transparent: true, coinCost: 5 },
      { assetType: 'overlay', slot: 'overlay', label: 'Overlay', exportName: 'Kick_Overlay.png', width: 1920, height: 1080, transparent: true, coinCost: 10 },
    ],
  },
  discord: {
    platform: 'discord',
    label: 'Discord',
    stickerCount: 5,
    assets: [
      { assetType: 'logo', slot: 'server_icon', label: 'Server Icon', exportName: 'Discord_ServerIcon.png', width: 512, height: 512, transparent: true, coinCost: 5 },
      { assetType: 'banner', slot: 'banner', label: 'Banner', exportName: 'Discord_Banner.png', width: 960, height: 540, transparent: false, coinCost: 10 },
      { assetType: 'wallpaper', slot: 'community_banner', label: 'Community Banner', exportName: 'Discord_CommunityBanner.png', width: 1920, height: 1080, transparent: false, coinCost: 10 },
      ...stickerSpecs('discord', 5),
    ],
  },
};

export function getStreamSetConfig(platform: string): StreamSetPlatformConfig {
  const key = platform as StreamSetPlatform;
  return STREAM_SET_CONFIGS[key] ?? STREAM_SET_CONFIGS.tiktok;
}

export function calculateStreamSetCost(platform: string): number {
  return getStreamSetConfig(platform).assets.reduce((sum, a) => sum + a.coinCost, 0);
}

export function buildStreamSetExportName(platform: string, slot: string, stickerIndex?: number): string | null {
  const config = getStreamSetConfig(platform);
  if (slot.startsWith('sticker_') && stickerIndex !== undefined) {
    const sticker = config.assets.find(a => a.assetType === 'sticker');
    if (sticker) {
      return `${STREAM_SET_PLATFORM_LABELS[config.platform]}_Sticker${String(stickerIndex + 1).padStart(2, '0')}.png`;
    }
  }
  const spec = config.assets.find(a => a.slot === slot);
  return spec?.exportName ?? null;
}

export function getStreamSetAssetSpec(platform: string, slot: string): StreamSetAssetSpec | null {
  return getStreamSetConfig(platform).assets.find(a => a.slot === slot) ?? null;
}

export function isTransparentAsset(platform: string, assetType: AssetType, slot?: string): boolean {
  if (slot) {
    const spec = getStreamSetAssetSpec(platform, slot);
    if (spec) return spec.transparent;
  }
  const transparentTypes: AssetType[] = ['logo', 'sticker', 'facecam', 'panel', 'overlay', 'alert'];
  return transparentTypes.includes(assetType);
}

export interface WizardPayload {
  platform: StreamSetPlatform;
  creatorName: string;
  clanName?: string;
  slogan?: string;
  niche: CreatorNiche;
  visualStyle: VisualStyle;
  primaryColors?: string[];
  accentColors?: string[];
  useDefaultColors?: boolean;
}

export function buildBrandingStyleFromWizard(w: WizardPayload): string {
  const parts = [w.visualStyle, w.niche, 'premium creator branding', 'neon glasmorphism'];
  if (w.clanName) parts.push(`clan ${w.clanName}`);
  if (w.slogan) parts.push(`mood: ${w.slogan}`);
  return parts.join(', ');
}

export function suggestColorsForWizard(niche: CreatorNiche, style: VisualStyle): { primary: string[]; accent: string[] } {
  const map: Record<string, { primary: string[]; accent: string[] }> = {
    Gaming: { primary: ['#FF2D95', '#7B2FFF'], accent: ['#00F5FF', '#FFE600'] },
    Streaming: { primary: ['#9146FF', '#00F5FF'], accent: ['#FF2D95', '#FFFFFF'] },
    Esports: { primary: ['#00F5FF', '#FF2D95'], accent: ['#B24BFF', '#1a1a2e'] },
    Cyberpunk: { primary: ['#FF0080', '#00FFFF'], accent: ['#FFD700', '#120458'] },
    Anime: { primary: ['#FF6B9D', '#C44DFF'], accent: ['#00D4FF', '#FFE066'] },
    Techno: { primary: ['#00FF88', '#FF00AA'], accent: ['#000000', '#FFFFFF'] },
  };
  const key = style === 'Cyberpunk' ? 'Cyberpunk' : style === 'Anime' ? 'Anime' : niche;
  return map[key] ?? { primary: ['#FF2D95', '#00F5FF', '#B24BFF'], accent: ['#00F5FF', '#FF2D95'] };
}
