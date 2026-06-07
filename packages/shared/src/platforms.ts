import type { AssetType } from './assets.js';

export type Platform =
  | 'twitch'
  | 'kick'
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'discord'
  | 'facebook'
  | 'x'
  | 'website';

export interface PlatformFormat {
  width: number;
  height: number;
  label: string;
}

export const PLATFORM_FORMATS: Record<Platform, Record<string, PlatformFormat>> = {
  twitch: {
    banner: { width: 1920, height: 480, label: 'Profilbanner' },
    offline: { width: 1920, height: 1080, label: 'Offline Screen' },
    panel: { width: 320, height: 100, label: 'Panel' },
    overlay: { width: 1920, height: 1080, label: 'Overlay' },
    facecam: { width: 640, height: 360, label: 'Facecam Rahmen 16:9' },
  },
  kick: {
    banner: { width: 1920, height: 480, label: 'Profilbanner' },
    offline: { width: 1920, height: 1080, label: 'Offline Screen' },
    panel: { width: 320, height: 100, label: 'Panel' },
    overlay: { width: 1920, height: 1080, label: 'Overlay' },
    facecam: { width: 640, height: 360, label: 'Facecam Rahmen 16:9' },
  },
  youtube: {
    banner: { width: 2560, height: 1440, label: 'Kanalbild' },
    thumbnail: { width: 1280, height: 720, label: 'Thumbnail' },
    overlay: { width: 1920, height: 1080, label: 'Overlay' },
  },
  tiktok: {
    profile: { width: 400, height: 400, label: 'Profilbild' },
    video_cover: { width: 1080, height: 1920, label: 'Video Cover' },
    live_cover: { width: 1080, height: 1920, label: 'Live Cover' },
    overlay: { width: 1080, height: 1920, label: 'Overlay' },
    sticker: { width: 512, height: 512, label: 'Sticker' },
  },
  instagram: {
    profile: { width: 320, height: 320, label: 'Profilbild' },
    post: { width: 1080, height: 1080, label: 'Post' },
    story: { width: 1080, height: 1920, label: 'Story' },
  },
  discord: {
    banner: { width: 960, height: 540, label: 'Server Banner' },
    icon: { width: 512, height: 512, label: 'Server Icon' },
    sticker: { width: 320, height: 320, label: 'Sticker' },
    community_banner: { width: 1920, height: 1080, label: 'Community Banner' },
  },
  facebook: {
    cover: { width: 820, height: 312, label: 'Titelbild' },
    profile: { width: 320, height: 320, label: 'Profilbild' },
  },
  x: {
    header: { width: 1500, height: 500, label: 'Header' },
    profile: { width: 400, height: 400, label: 'Profilbild' },
  },
  website: {
    hero: { width: 1920, height: 1080, label: 'Hero Banner' },
    logo: { width: 512, height: 512, label: 'Logo' },
  },
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  twitch: 'Twitch',
  kick: 'Kick',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  discord: 'Discord',
  facebook: 'Facebook',
  x: 'X',
  website: 'Website',
};

export function getPlatformFormat(
  platform: string,
  assetType: AssetType | string,
): PlatformFormat | null {
  if (!(platform in PLATFORM_FORMATS)) return null;
  const formats = PLATFORM_FORMATS[platform as Platform];
  const keyMap: Record<string, string> = {
    banner: 'banner',
    facecam: 'facecam',
    overlay: 'overlay',
    panel: 'panel',
    offline: 'offline',
    thumbnail: 'thumbnail',
    starting_soon: 'offline',
    brb: 'offline',
    ending: 'offline',
    logo: 'logo',
    social: 'post',
  };
  const key = keyMap[assetType] || assetType;
  return formats[key] ?? null;
}

export function formatDimensionsLabel(format: PlatformFormat): string {
  return `${format.width} × ${format.height}px – ${format.label}`;
}
