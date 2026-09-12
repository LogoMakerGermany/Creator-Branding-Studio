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
    promptHint: 'full-bleed starting soon screen composition, title-safe layout, no camera frame',
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
    promptHint: 'wide horizontal banner composition for Twitch header, 16:9 landscape',
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
    promptHint: 'transparent facecam frame composition, webcam window, alpha edges',
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

/** Configurator slots that make up STREAMSET – 3 TEILE (Facecam, Startscreen, Banner). */
export const STREAMSET_THREE_PART_SLOT_IDS = ['facecam', 'starting-screen', 'banner'] as const;

export const STREAMSET_THREE_PART_COIN_COST = COIN_COSTS[CoinSpendCategory.STREAMSET_THREE_PART];

export type StreamsetPricingSku = 'komplettset' | 'three_part' | 'a_la_carte';

export const STREAMSET_KIND_DEFAULT: Record<StreamsetGeneratorKind, string> = {
  overlay: 'starting-soon',
  banner: 'twitch-banner',
  facecam: 'facecam',
  sticker: 'sticker',
};

/** Keys used by Nexter missing-asset copy (same catalog as the pack). */
export const STREAMSET_ASSET_GAPS = STREAMSET_PACK_ITEMS.map((item) => item.key);

export const STREAMSET_EXTRA_ITEMS: StreamsetAssetDef[] = [
  {
    key: 'tiktok-banner',
    label: 'TikTok Banner',
    tab: 'banner',
    module: 'banner',
    platform: 'tiktok',
    coinCategory: CoinSpendCategory.BANNER_GENERATION,
  },
  {
    key: 'discord-banner',
    label: 'Discord Banner',
    tab: 'banner',
    module: 'banner',
    platform: 'discord',
    coinCategory: CoinSpendCategory.BANNER_GENERATION,
  },
];

export const STREAMSET_GENERATABLE_ITEMS: StreamsetAssetDef[] = [
  ...STREAMSET_PACK_ITEMS,
  ...STREAMSET_EXTRA_ITEMS,
];

export type CreatorAssetCatalogType =
  | 'logo'
  | 'facecam'
  | 'overlay'
  | 'banner'
  | 'starting-screen'
  | 'brb-screen'
  | 'ending-screen'
  | 'streamset'
  | 'intro'
  | 'outro'
  | 'animation'
  | 'sticker'
  | 'badge';

export const CREATOR_ASSET_CATALOG: Array<{
  type: CreatorAssetCatalogType;
  aliases: string[];
  streamsetKeys: string[];
  studioPath?: string;
}> = [
  { type: 'logo', aliases: [], streamsetKeys: [], studioPath: '/logo-studio' },
  { type: 'facecam', aliases: [], streamsetKeys: ['facecam'], studioPath: '/facecam-studio' },
  { type: 'overlay', aliases: ['hud', 'gameplay-overlay'], streamsetKeys: ['hud'], studioPath: '/overlay-studio' },
  {
    type: 'banner',
    aliases: [],
    streamsetKeys: ['twitch-banner', 'youtube-banner', 'tiktok-banner', 'discord-banner'],
    studioPath: '/banner-studio',
  },
  { type: 'starting-screen', aliases: ['starting-soon', 'startscreen'], streamsetKeys: ['starting-soon'] },
  { type: 'brb-screen', aliases: ['brb', 'pausenscreen'], streamsetKeys: ['brb'] },
  { type: 'ending-screen', aliases: ['ending', 'endscreen'], streamsetKeys: ['ending'] },
  { type: 'streamset', aliases: [], streamsetKeys: STREAMSET_PACK_ITEMS.map((i) => i.key), studioPath: '/streamset-studio' },
  { type: 'intro', aliases: [], streamsetKeys: [], studioPath: '/intro-outro' },
  { type: 'outro', aliases: [], streamsetKeys: [], studioPath: '/intro-outro' },
  { type: 'animation', aliases: [], streamsetKeys: [], studioPath: '/animation-studio' },
  { type: 'sticker', aliases: ['emote'], streamsetKeys: ['sticker'], studioPath: '/sticker-studio' },
  { type: 'badge', aliases: [], streamsetKeys: ['sticker'], studioPath: '/sticker-studio' },
];

const ASSET_TYPE_ALIAS: Record<string, CreatorAssetCatalogType> = Object.fromEntries(
  CREATOR_ASSET_CATALOG.flatMap((entry) => [
    [entry.type, entry.type],
    ...entry.aliases.map((alias) => [alias, entry.type] as const),
  ])
) as Record<string, CreatorAssetCatalogType>;

export function resolveCreatorAssetType(raw: string): CreatorAssetCatalogType | undefined {
  const key = raw.trim().toLowerCase();
  return ASSET_TYPE_ALIAS[key];
}

export type StreamsetPlatform = 'twitch' | 'tiktok' | 'youtube' | 'discord';

export const STREAMSET_PLATFORMS: StreamsetPlatform[] = ['twitch', 'tiktok', 'youtube', 'discord'];

export interface StreamsetConfiguratorSlot {
  id: string;
  label: string;
  keys: string[];
  optional: boolean;
  platformBanner?: boolean;
  note?: string;
}

/** Selectable pack parts — only assets that already exist in the catalog. */
export const STREAMSET_CONFIGURATOR_SLOTS: StreamsetConfiguratorSlot[] = [
  { id: 'facecam', label: 'Facecam', keys: ['facecam'], optional: false },
  { id: 'gameplay-overlay', label: 'Gameplay Overlay', keys: ['hud'], optional: false },
  {
    id: 'chat',
    label: 'Chatbereich',
    keys: ['just-chatting'],
    optional: true,
    note: 'Just-Chatting-Screen mit Chat-Komposition',
  },
  { id: 'starting-screen', label: 'Startscreen', keys: ['starting-soon'], optional: false },
  { id: 'brb-screen', label: 'Pausenscreen', keys: ['brb'], optional: false },
  { id: 'ending-screen', label: 'Endscreen', keys: ['ending'], optional: false },
  { id: 'banner', label: 'Banner', keys: [], optional: false, platformBanner: true },
  { id: 'alert', label: 'Alerts', keys: ['alert'], optional: true },
  { id: 'panel', label: 'Panels', keys: ['panel'], optional: true },
];

export const STREAMSET_PLATFORM_BANNER_KEY: Record<StreamsetPlatform, string> = {
  twitch: 'twitch-banner',
  tiktok: 'tiktok-banner',
  youtube: 'youtube-banner',
  discord: 'discord-banner',
};

export const STREAMSET_PLATFORM_DEFAULT_SLOT_IDS: Record<StreamsetPlatform, string[]> = {
  twitch: ['facecam', 'gameplay-overlay', 'starting-screen', 'brb-screen', 'ending-screen', 'banner'],
  tiktok: ['facecam', 'gameplay-overlay', 'starting-screen', 'ending-screen', 'banner'],
  youtube: ['facecam', 'gameplay-overlay', 'starting-screen', 'ending-screen', 'banner'],
  discord: ['banner', 'panel'],
};

export interface StreamLayoutSlot {
  id: string;
  label: string;
  type: 'facecam' | 'gameplay' | 'chat' | 'overlay';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StreamLayoutPreset {
  id: string;
  platform: StreamsetPlatform | 'obs' | 'streamlabs';
  label: string;
  width: number;
  height: number;
  aspect: string;
  slots: StreamLayoutSlot[];
}

export const STREAM_LAYOUT_PRESETS: Record<string, StreamLayoutPreset> = {
  twitch: {
    id: 'twitch',
    platform: 'twitch',
    label: 'Twitch 16:9',
    width: 1920,
    height: 1080,
    aspect: '16:9',
    slots: [
      { id: 'gameplay', label: 'Gameplay', type: 'gameplay', x: 0, y: 0, width: 1920, height: 1080 },
      { id: 'facecam', label: 'Facecam', type: 'facecam', x: 48, y: 732, width: 420, height: 300 },
      { id: 'chat', label: 'Chat', type: 'chat', x: 1540, y: 160, width: 340, height: 720 },
    ],
  },
  tiktok: {
    id: 'tiktok',
    platform: 'tiktok',
    label: 'TikTok 9:16 — Facecam oben, Gameplay Mitte, Chat unten',
    width: 1080,
    height: 1920,
    aspect: '9:16',
    slots: [
      { id: 'facecam', label: 'Facecam oben', type: 'facecam', x: 90, y: 48, width: 900, height: 420 },
      { id: 'gameplay', label: 'Gameplay Mitte', type: 'gameplay', x: 40, y: 500, width: 1000, height: 900 },
      { id: 'chat', label: 'Chat unten', type: 'chat', x: 40, y: 1450, width: 1000, height: 420 },
    ],
  },
  youtube: {
    id: 'youtube',
    platform: 'youtube',
    label: 'YouTube 16:9',
    width: 1920,
    height: 1080,
    aspect: '16:9',
    slots: [
      { id: 'gameplay', label: 'Gameplay', type: 'gameplay', x: 0, y: 0, width: 1920, height: 1080 },
      { id: 'facecam', label: 'Facecam', type: 'facecam', x: 48, y: 732, width: 420, height: 300 },
    ],
  },
  discord: {
    id: 'discord',
    platform: 'discord',
    label: 'Discord 16:9',
    width: 1920,
    height: 1080,
    aspect: '16:9',
    slots: [{ id: 'overlay', label: 'Overlay', type: 'overlay', x: 0, y: 0, width: 1920, height: 1080 }],
  },
};

export function getStreamLayoutPreset(platform: string): StreamLayoutPreset {
  return STREAM_LAYOUT_PRESETS[platform] ?? STREAM_LAYOUT_PRESETS.twitch;
}

export function bannerKeyForPlatform(platform: StreamsetPlatform): string {
  return STREAMSET_PLATFORM_BANNER_KEY[platform];
}

export function keysForConfiguratorSlot(slot: StreamsetConfiguratorSlot, platform: StreamsetPlatform): string[] {
  if (slot.platformBanner) return [bannerKeyForPlatform(platform)];
  return slot.keys;
}

export function defaultSlotIdsForPlatform(platform: StreamsetPlatform): string[] {
  if (platform === 'discord') return ['banner', 'panel'];
  return STREAMSET_PLATFORM_DEFAULT_SLOT_IDS[platform];
}

export function resolveStreamsetSelection(
  platform: StreamsetPlatform,
  selectedKeys?: string[],
  selectedSlotIds?: string[]
): string[] {
  if (selectedKeys?.length) {
    const unique = [...new Set(selectedKeys.map((k) => k.trim()).filter(Boolean))];
    return unique.filter((key) => Boolean(getStreamsetAsset(key)));
  }
  const slots = (selectedSlotIds?.length ? selectedSlotIds : defaultSlotIdsForPlatform(platform))
    .map((id) => STREAMSET_CONFIGURATOR_SLOTS.find((s) => s.id === id))
    .filter((s): s is StreamsetConfiguratorSlot => Boolean(s));
  const keys = slots.flatMap((slot) => keysForConfiguratorSlot(slot, platform));
  if (platform === 'discord' && !keys.includes('sticker')) {
    const sticker = getStreamsetAsset('sticker');
    if (sticker) keys.push('sticker');
  }
  return [...new Set(keys.filter((key) => Boolean(getStreamsetAsset(key))))];
}

export function sameKeySet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((key, i) => key === right[i]);
}

export function keysForStreamsetThreePart(platform: StreamsetPlatform): string[] {
  const slots = STREAMSET_THREE_PART_SLOT_IDS.map((id) => STREAMSET_CONFIGURATOR_SLOTS.find((slot) => slot.id === id)).filter(
    (slot): slot is StreamsetConfiguratorSlot => Boolean(slot)
  );
  return [...new Set(slots.flatMap((slot) => keysForConfiguratorSlot(slot, platform)).filter((key) => Boolean(getStreamsetAsset(key))))];
}

export function isStreamsetThreePartSelection(keys: string[]): boolean {
  return STREAMSET_PLATFORMS.some((platform) => sameKeySet(keys, keysForStreamsetThreePart(platform)));
}

export function streamsetOfferLabel(sku: StreamsetPricingSku): string {
  if (sku === 'komplettset') return 'Komplettset';
  if (sku === 'three_part') return 'Streamset – 3 Teile';
  return 'Streamset';
}

export function coinCostForStreamsetSelection(keys: string[]): {
  itemCosts: Array<{ key: string; label: string; coinCost: number }>;
  total: number;
  packDiscountApplied: boolean;
  pricingSku: StreamsetPricingSku;
  spendCategory: CoinSpendCategory;
  ledgerDescription: string;
} {
  const items = keys
    .map((key) => getStreamsetAsset(key))
    .filter((item): item is StreamsetAssetDef => Boolean(item));
  const itemCosts = items.map((item) => ({
    key: item.key,
    label: item.label,
    coinCost: COIN_COSTS[item.coinCategory],
  }));
  const aLaCarte = itemCosts.reduce((sum, row) => sum + row.coinCost, 0);
  const selectedKeys = items.map((item) => item.key);
  const packKeys = STREAMSET_PACK_ITEMS.map((item) => item.key);
  if (sameKeySet(selectedKeys, packKeys)) {
    return {
      itemCosts,
      total: STREAMSET_PACK_COIN_COST,
      packDiscountApplied: true,
      pricingSku: 'komplettset',
      spendCategory: CoinSpendCategory.STREAMSET_PACK,
      ledgerDescription: 'Komplettset',
    };
  }
  if (isStreamsetThreePartSelection(selectedKeys)) {
    return {
      itemCosts,
      total: STREAMSET_THREE_PART_COIN_COST,
      packDiscountApplied: true,
      pricingSku: 'three_part',
      spendCategory: CoinSpendCategory.STREAMSET_THREE_PART,
      ledgerDescription: 'Streamset – 3 Teile',
    };
  }
  return {
    itemCosts,
    total: aLaCarte,
    packDiscountApplied: false,
    pricingSku: 'a_la_carte',
    spendCategory: CoinSpendCategory.STREAMSET_PACK,
    ledgerDescription: 'Streamset Generierung',
  };
}

const TRANSPARENT_MODULES = new Set(['facecam', 'sticker']);
const SCREEN_KEYS = new Set(['starting-soon', 'brb', 'offline', 'ending', 'just-chatting']);

export function catalogTypeForStreamsetKey(key: string): CreatorAssetCatalogType | undefined {
  if (key === 'starting-soon') return 'starting-screen';
  if (key === 'brb') return 'brb-screen';
  if (key === 'ending') return 'ending-screen';
  if (key === 'hud' || key === 'alert' || key === 'panel' || key === 'offline' || key === 'just-chatting') {
    return 'overlay';
  }
  const item = getStreamsetAsset(key);
  if (!item) return undefined;
  if (item.module === 'banner') return 'banner';
  if (item.module === 'facecam') return 'facecam';
  if (item.module === 'sticker') return 'sticker';
  return 'overlay';
}

export function assetRequiresTransparency(item: StreamsetAssetDef): boolean {
  if (SCREEN_KEYS.has(item.key)) return false;
  if (item.transparentBackground === true) return true;
  if (item.transparentBackground === false) return false;
  if (TRANSPARENT_MODULES.has(item.module)) return true;
  return item.tab === 'overlays';
}

export function transparencyConstraintForItem(item: StreamsetAssetDef): string {
  if (assetRequiresTransparency(item)) {
    return 'transparent PNG background, alpha channel required, no opaque full-bleed backdrop';
  }
  return 'opaque full-screen or banner graphic, do not force a transparent background';
}

export function streamsetSharedDesignParams(dna: {
  primaryColors?: string[];
  secondaryColors?: string[];
  accentColors?: string[];
  mascot?: string;
  styleDirection?: string;
  visualLanguage?: string;
  fonts?: Array<{ name: string }>;
  brandingStyle?: string;
}): {
  primaryColors: string[];
  accentColors: string[];
  motif: string;
  materials: string;
  typography: string;
  lighting: string;
  style: string;
} {
  return {
    primaryColors: dna.primaryColors ?? [],
    accentColors: [...(dna.secondaryColors ?? []), ...(dna.accentColors ?? [])].slice(0, 4),
    motif: dna.mascot || 'creator mark',
    materials: dna.visualLanguage || dna.brandingStyle || 'matching pack materials',
    typography: dna.fonts?.[0]?.name || 'consistent type direction',
    lighting: dna.visualLanguage || 'shared light and effect language',
    style: dna.styleDirection || 'brand-consistent',
  };
}

export function streamsetConsistencyConstraint(dna: Parameters<typeof streamsetSharedDesignParams>[0]): string {
  const shared = streamsetSharedDesignParams(dna);
  return [
    `shared pack design: primary ${shared.primaryColors.join(', ') || 'DNA colors'}`,
    `accents ${shared.accentColors.join(', ') || 'DNA accents'}`,
    `motif ${shared.motif}`,
    `materials ${shared.materials}`,
    `typography ${shared.typography}`,
    `lighting ${shared.lighting}`,
    'keep this visual system; do not copy another asset type composition (facecam ≠ banner ≠ startscreen)',
  ].join('; ');
}

export function getStreamsetAsset(key: string): StreamsetAssetDef | undefined {
  return STREAMSET_GENERATABLE_ITEMS.find((item) => item.key === key);
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

export function latestJobsPerAssetKey<T extends StreamsetJobLike>(jobs: T[]): T[] {
  const sorted = [...jobs].sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const job of sorted) {
    const key = job.assetKey;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(job);
  }
  return out;
}

export function pickJobForStreamsetAsset<T extends StreamsetJobLike>(
  item: StreamsetAssetDef,
  jobs: T[]
): T | undefined {
  const keyed = jobs.filter((job) => job.assetKey === item.key);
  if (keyed.length) return latestJobsPerAssetKey(keyed)[0];
  return jobs.find((job) => jobMatchesStreamsetAsset(item, job));
}

export function streamsetDownloadBasename(creatorName: string | undefined, assetKey: string, ext = 'png'): string {
  const creator = String(creatorName || 'creator')
    .replace(/[^\w\-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'creator';
  const key = String(assetKey || 'asset')
    .replace(/[^\w\-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'asset';
  return `${creator}-${key}.${ext}`;
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

export function refundSharesForSelection(
  itemCosts: Array<{ key: string; coinCost: number }>,
  chargedTotal: number
): Record<string, number> {
  const shares: Record<string, number> = {};
  if (!itemCosts.length || chargedTotal <= 0) return shares;
  const aLaCarte = itemCosts.reduce((sum, row) => sum + row.coinCost, 0);
  if (aLaCarte === chargedTotal) {
    for (const row of itemCosts) shares[row.key] = row.coinCost;
    return shares;
  }
  let allocated = 0;
  itemCosts.forEach((row, index) => {
    if (index === itemCosts.length - 1) {
      shares[row.key] = Math.max(0, chargedTotal - allocated);
      return;
    }
    const share = aLaCarte > 0 ? Math.floor((row.coinCost / aLaCarte) * chargedTotal) : 0;
    shares[row.key] = share;
    allocated += share;
  });
  return shares;
}

export type StreamsetBatchStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'partial';

export function deriveStreamsetBatchStatus(
  jobs: Array<{ status: string }>
): StreamsetBatchStatus {
  if (!jobs.length) return 'failed';
  const completed = jobs.filter((j) => j.status === 'completed').length;
  const failed = jobs.filter((j) => j.status === 'failed').length;
  const running = jobs.some((j) => j.status === 'processing' || j.status === 'queued');
  if (running) return 'processing';
  if (completed === jobs.length) return 'completed';
  if (failed === jobs.length) return 'failed';
  if (completed > 0 && failed > 0) return 'partial';
  return 'processing';
}

