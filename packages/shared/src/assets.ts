export const ASSET_TYPES = [
  'logo',
  'banner',
  'facecam',
  'overlay',
  'panel',
  'wallpaper',
  'thumbnail',
  'sticker',
  'alert',
  'offline',
  'starting_soon',
  'brb',
  'ending',
  'social',
  'merchandise',
  'discord',
  'youtube',
  'tiktok',
  'kick',
  'twitch',
  'intro',
  'outro',
  'stinger',
  'transition',
  'loading',
  'social_reveal',
  'product_reveal',
  'clan_intro',
  'team_intro',
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_LABELS: Record<AssetType, string> = {
  logo: 'Logo Generator',
  banner: 'Banner Generator',
  facecam: 'Facecam Generator',
  overlay: 'Overlay Generator',
  panel: 'Panel Generator',
  wallpaper: 'Wallpaper Generator',
  thumbnail: 'Thumbnail Generator',
  sticker: 'Sticker Generator',
  alert: 'Alert Generator',
  offline: 'Offline Screen Generator',
  starting_soon: 'Starting Soon Generator',
  brb: 'BRB Generator',
  ending: 'Ending Screen Generator',
  social: 'Social Media Generator',
  merchandise: 'Merchandise Generator',
  discord: 'Discord Generator',
  youtube: 'YouTube Generator',
  tiktok: 'TikTok Generator',
  kick: 'Kick Generator',
  twitch: 'Twitch Generator',
  intro: 'Intro Animation',
  outro: 'Outro Animation',
  stinger: 'Stinger',
  transition: 'Transition',
  loading: 'Loading Screen',
  social_reveal: 'Social Reveal',
  product_reveal: 'Product Reveal',
  clan_intro: 'Clan Intro',
  team_intro: 'Team Intro',
};

export const STREAM_PACK_ASSETS: AssetType[] = [
  'logo',
  'banner',
  'overlay',
  'facecam',
  'panel',
  'offline',
  'starting_soon',
  'brb',
  'ending',
  'intro',
  'outro',
  'stinger',
  'sticker',
];

export const VIDEO_ASSET_TYPES: AssetType[] = [
  'intro',
  'outro',
  'stinger',
  'transition',
  'loading',
  'social_reveal',
  'product_reveal',
  'clan_intro',
  'team_intro',
];

export const VIDEO_DURATIONS = [5, 10, 15, 30] as const;
export type VideoDuration = (typeof VIDEO_DURATIONS)[number];

export type JobStatus = 'queued' | 'processing' | 'done' | 'failed';

export interface GenerationJob {
  id: string;
  projectId: string;
  assetType: AssetType;
  status: JobStatus;
  provider?: string;
  filePath?: string;
  fileName?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateRequest {
  platform?: string;
  customText?: string;
  duration?: VideoDuration;
  stickerTexts?: string[];
  stickerIndex?: number;
  skipCoinCharge?: boolean;
  exportSlot?: string;
  formatOverride?: { width: number; height: number };
  wizardContext?: {
    creatorName?: string;
    clanName?: string;
    slogan?: string;
    niche?: string;
    visualStyle?: string;
  };
}
