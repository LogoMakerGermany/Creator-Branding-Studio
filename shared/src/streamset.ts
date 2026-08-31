import { CoinSpendCategory, COIN_COSTS } from './coins';
import type {
  BannerGenerationOptions,
  BannerPlatform,
  FacecamGenerationOptions,
  OverlayGenerationOptions,
  StickerGenerationOptions,
} from './studio';

export type StreamsetTab = 'screens' | 'overlays' | 'banner' | 'facecam' | 'sticker';

export type StreamsetGeneratorKind = 'overlay' | 'banner' | 'facecam' | 'sticker';

export interface StreamsetAssetDef {
  key: string;
  label: string;
  tab: StreamsetTab;
  module: StreamsetGeneratorKind;
  coinCategory: CoinSpendCategory;
  overlayType?: OverlayGenerationOptions['overlayType'];
  transparentBackground?: boolean;
  platform?: BannerPlatform;
  promptHint?: string;
}

export const STREAMSET_PACK_ITEMS: StreamsetAssetDef[] = [
  {
    key: 'starting-soon',
    label: 'Starting Soon',
    tab: 'screens',
    module: 'overlay',
    overlayType: 'starting-soon',
    transparentBackground: false,
    coinCategory: CoinSpendCategory.OVERLAY_GENERATION,
  },
  {
    key: 'brb',
    label: 'BRB',
    tab: 'screens',
    module: 'overlay',
    overlayType: 'brb',
    transparentBackground: false,
    coinCategory: CoinSpendCategory.OVERLAY_GENERATION,
  },
  {
    key: 'offline',
    label: 'Offline',
    tab: 'screens',
    module: 'overlay',
    overlayType: 'offline',
    transparentBackground: false,
    coinCategory: CoinSpendCategory.OVERLAY_GENERATION,
  },
  {
    key: 'ending',
    label: 'Ending',
    tab: 'screens',
    module: 'overlay',
    overlayType: 'ending',
    transparentBackground: false,
    coinCategory: CoinSpendCategory.OVERLAY_GENERATION,
  },
  {
    key: 'just-chatting',
    label: 'Just Chatting',
    tab: 'screens',
    module: 'overlay',
    overlayType: 'full-scene',
    transparentBackground: false,
    coinCategory: CoinSpendCategory.OVERLAY_GENERATION,
    promptHint: 'just chatting / chill stream layout with webcam area and chat composition',
  },
  {
    key: 'hud',
    label: 'HUD',
    tab: 'overlays',
    module: 'overlay',
    overlayType: 'hud',
    transparentBackground: true,
    coinCategory: CoinSpendCategory.OVERLAY_GENERATION,
  },
  {
    key: 'panel',
    label: 'Panel',
    tab: 'overlays',
    module: 'overlay',
    overlayType: 'panel',
    transparentBackground: true,
    coinCategory: CoinSpendCategory.OVERLAY_GENERATION,
  },
  {
    key: 'alert',
    label: 'Alert',
    tab: 'overlays',
    module: 'overlay',
    overlayType: 'alert',
    transparentBackground: true,
    coinCategory: CoinSpendCategory.OVERLAY_GENERATION,
  },
  {
    key: 'twitch-banner',
    label: 'Twitch Banner',
    tab: 'banner',
    module: 'banner',
    platform: 'twitch',
    coinCategory: CoinSpendCategory.BANNER_GENERATION,
  },
  {
    key: 'youtube-banner',
    label: 'YouTube Banner',
    tab: 'banner',
    module: 'banner',
    platform: 'youtube',
    coinCategory: CoinSpendCategory.BANNER_GENERATION,
  },
  {
    key: 'facecam',
    label: 'Facecam',
    tab: 'facecam',
    module: 'facecam',
    coinCategory: CoinSpendCategory.FACECAM_GENERATION,
  },
  {
    key: 'sticker',
    label: 'Sticker / Emote',
    tab: 'sticker',
    module: 'sticker',
    coinCategory: CoinSpendCategory.STICKER_GENERATION,
  },
];

export const STREAMSET_TABS: { id: StreamsetTab; label: string }[] = [
  { id: 'screens', label: 'Screens' },
  { id: 'overlays', label: 'Overlays' },
  { id: 'banner', label: 'Banner' },
  { id: 'facecam', label: 'Facecam' },
  { id: 'sticker', label: 'Stickers' },
];

export const STREAMSET_PACK_COIN_COST = COIN_COSTS[CoinSpendCategory.STREAMSET_PACK];

export const STREAMSET_KIND_DEFAULT: Record<StreamsetGeneratorKind, string> = {
  overlay: 'starting-soon',
  banner: 'twitch-banner',
  facecam: 'facecam',
  sticker: 'sticker',
};

/** Keys used by Nexter missing-asset copy (same catalog as the pack). */
export const STREAMSET_ASSET_GAPS = STREAMSET_PACK_ITEMS.map((item) => item.key);

export function getStreamsetAsset(key: string): StreamsetAssetDef | undefined {
  return STREAMSET_PACK_ITEMS.find((item) => item.key === key);
}

export function resolveStreamsetAssetKey(
  assetKey?: string,
  kind?: StreamsetGeneratorKind
): StreamsetAssetDef | undefined {
  if (assetKey) return getStreamsetAsset(assetKey);
  if (kind) return getStreamsetAsset(STREAMSET_KIND_DEFAULT[kind]);
  return undefined;
}

export interface StreamsetJobLike {
  status: string;
  imageUrl?: string;
  module: string;
  assetKey?: string;
  createdAt?: string;
}

export function streamsetAssetPresent(item: StreamsetAssetDef, jobs: StreamsetJobLike[]): boolean {
  return jobs.some((job) => jobMatchesStreamsetAsset(item, job) && job.status === 'completed' && Boolean(job.imageUrl));
}

export function jobMatchesStreamsetAsset(item: StreamsetAssetDef, job: StreamsetJobLike): boolean {
  if (job.assetKey) return job.assetKey === item.key;
  if (item.module === 'banner' && item.platform === 'twitch' && job.module === 'banner') return true;
  if (item.module === 'facecam' && job.module === 'facecam') return true;
  if (item.module === 'sticker' && job.module === 'sticker') return true;
  return false;
}

export function pickJobForStreamsetAsset<T extends StreamsetJobLike>(
  item: StreamsetAssetDef,
  jobs: T[]
): T | undefined {
  const keyed = jobs.filter((job) => job.assetKey === item.key);
  if (keyed.length) return keyed[0];
  return jobs.find((job) => jobMatchesStreamsetAsset(item, job));
}

export function missingStreamsetLabels(jobs: StreamsetJobLike[]): string[] {
  return STREAMSET_PACK_ITEMS.filter((item) => !streamsetAssetPresent(item, jobs)).map((item) => item.label);
}

export function optionsForStreamsetItem(
  item: StreamsetAssetDef,
  dnaStyle?: string
): BannerGenerationOptions | OverlayGenerationOptions | FacecamGenerationOptions | StickerGenerationOptions {
  if (item.module === 'banner') {
    return { platform: item.platform ?? 'twitch', style: dnaStyle };
  }
  if (item.module === 'overlay') {
    return {
      overlayType: item.overlayType,
      transparentBackground: item.transparentBackground,
      style: dnaStyle,
    };
  }
  if (item.module === 'facecam') {
    return { transparentBackground: true, shape: 'rectangle', style: dnaStyle };
  }
  return { transparentBackground: true, multicolor: true, style: dnaStyle };
}
