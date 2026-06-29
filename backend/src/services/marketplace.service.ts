import { randomUUID } from 'node:crypto';
import type { MarketplaceCategory } from '@ucbs/shared';
import { isDevMode, isProduction } from '../config/env.js';
import { dsGet, dsSet, dsList, dsListWhere } from '../lib/data-store.js';
import { uploadAssetFromDataUrl } from '../lib/firebase-storage.js';
import { parseAndValidateDataUrl, parseAndValidateVideoDataUrl } from '../lib/upload-validation.js';
import { ServiceError } from '../lib/errors.js';
import { deductAmount } from './coins.service.js';

const ITEMS_COLLECTION = 'marketplaceItems';
const PURCHASES_COLLECTION = 'marketplacePurchases';

export interface MarketplaceItem {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  category: MarketplaceCategory;
  priceCoins: number;
  previewUrl: string;
  downloadUrl: string;
  tags: string[];
  rating: number;
  reviewCount: number;
  downloadCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplacePurchase {
  id: string;
  buyerId: string;
  itemId: string;
  priceCoins: number;
  createdAt: string;
}

function isPlaceholderSvgUrl(url: string): boolean {
  return url.startsWith('data:image/svg+xml');
}

function isAllowedExternalUrl(url: string): boolean {
  return url.startsWith('https://') || url.startsWith('http://');
}

async function persistListingAsset(
  sellerId: string,
  listingId: string,
  dataUrl: string,
  kind: 'preview' | 'asset'
): Promise<string> {
  const trimmed = dataUrl.trim();

  if (isAllowedExternalUrl(trimmed)) {
    return trimmed;
  }

  if (isPlaceholderSvgUrl(trimmed)) {
    throw new ServiceError(400, 'INVALID_UPLOAD', 'Platzhalter-Bilder sind nicht erlaubt');
  }

  let mimeType: string;
  if (kind === 'preview') {
    ({ mimeType } = parseAndValidateDataUrl(trimmed));
  } else {
    try {
      ({ mimeType } = parseAndValidateDataUrl(trimmed));
    } catch {
      ({ mimeType } = parseAndValidateVideoDataUrl(trimmed));
    }
  }

  const ext = mimeType.split('/')[1]?.replace('svg+xml', 'svg') || 'bin';

  return uploadAssetFromDataUrl(sellerId, trimmed, {
    folder: 'marketplace',
    fileName: `${listingId}-${kind}.${ext}`,
  });
}

/** Dev-only demo listings — never runs in production. */
async function seedMarketplaceDev(): Promise<void> {
  if (isProduction() || !isDevMode()) return;

  const existing = await dsList(ITEMS_COLLECTION);
  if (existing.length > 0) return;

  const now = new Date().toISOString();
  const demoPreview = (label: string, color: string) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="${color}"/><text x="200" y="150" text-anchor="middle" fill="white" font-size="18">${label}</text></svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  };

  const seeds: Omit<MarketplaceItem, 'id'>[] = [
    {
      sellerId: 'system',
      title: '[Dev] Neon Gaming Logo Pack',
      description: 'Demo-Listing — nur in Dev sichtbar',
      category: 'logo',
      priceCoins: 25,
      previewUrl: demoPreview('Logo Pack', '#7C3AED'),
      downloadUrl: demoPreview('Logo Pack', '#7C3AED'),
      tags: ['demo', 'dev'],
      rating: 4.8,
      reviewCount: 42,
      downloadCount: 128,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      sellerId: 'system',
      title: '[Dev] Twitch Overlay Pro',
      description: 'Demo-Listing — nur in Dev sichtbar',
      category: 'overlay',
      priceCoins: 40,
      previewUrl: demoPreview('Overlay', '#3B82F6'),
      downloadUrl: demoPreview('Overlay', '#3B82F6'),
      tags: ['demo', 'dev'],
      rating: 4.9,
      reviewCount: 67,
      downloadCount: 203,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const item of seeds) {
    const id = randomUUID();
    await dsSet(ITEMS_COLLECTION, id, { ...item, id } as unknown as Record<string, unknown>);
  }
}

function filterPublicItems(items: MarketplaceItem[]): MarketplaceItem[] {
  return items.filter((item) => {
    if (!item.isActive) return false;
    if (isProduction() && item.sellerId === 'system') return false;
    if (isProduction() && isPlaceholderSvgUrl(item.previewUrl)) return false;
    return true;
  });
}

export async function listMarketplaceItems(category?: MarketplaceCategory): Promise<MarketplaceItem[]> {
  await seedMarketplaceDev();
  const items = (await dsList(ITEMS_COLLECTION)) as unknown as MarketplaceItem[];
  return filterPublicItems(items)
    .filter((i) => !category || i.category === category)
    .sort((a, b) => b.downloadCount - a.downloadCount);
}

export async function getMarketplaceItem(id: string): Promise<MarketplaceItem | null> {
  await seedMarketplaceDev();
  const item = await dsGet(ITEMS_COLLECTION, id);
  if (!item) return null;
  const typed = item as unknown as MarketplaceItem;
  if (isProduction() && typed.sellerId === 'system') return null;
  return typed;
}

export async function listPurchases(userId: string): Promise<MarketplacePurchase[]> {
  const purchases = await dsListWhere(PURCHASES_COLLECTION, { buyerId: userId }, 'createdAt', 'desc');
  return purchases as unknown as MarketplacePurchase[];
}

export async function purchaseItem(
  buyerId: string,
  itemId: string
): Promise<{ purchase: MarketplacePurchase; item: MarketplaceItem; newBalance: number }> {
  const item = await getMarketplaceItem(itemId);
  if (!item || !item.isActive) throw new ServiceError(404, 'NOT_FOUND', 'Artikel nicht gefunden');

  if (item.sellerId === buyerId) {
    throw new ServiceError(400, 'PURCHASE_FAILED', 'Eigene Listings können nicht gekauft werden');
  }

  const already = await dsListWhere(PURCHASES_COLLECTION, { buyerId, itemId });
  if (already.length > 0) throw new ServiceError(400, 'PURCHASE_FAILED', 'Bereits gekauft');

  const coinResult = await deductAmount(buyerId, item.priceCoins, `Marketplace: ${item.title}`);
  if (!coinResult.success) throw new ServiceError(402, 'INSUFFICIENT_COINS', 'Nicht genügend Coins');

  const purchase: MarketplacePurchase = {
    id: randomUUID(),
    buyerId,
    itemId,
    priceCoins: item.priceCoins,
    createdAt: new Date().toISOString(),
  };

  await dsSet(PURCHASES_COLLECTION, purchase.id, purchase as unknown as Record<string, unknown>);

  item.downloadCount += 1;
  item.updatedAt = new Date().toISOString();
  await dsSet(ITEMS_COLLECTION, item.id, item as unknown as Record<string, unknown>);

  return { purchase, item, newBalance: coinResult.newBalance };
}

export async function getPurchasedDownloadUrl(userId: string, itemId: string): Promise<string | null> {
  const item = await getMarketplaceItem(itemId);
  if (!item) return null;

  const owned = await dsListWhere(PURCHASES_COLLECTION, { buyerId: userId, itemId });
  if (owned.length === 0) return null;

  return item.downloadUrl || item.previewUrl;
}

export async function listUserListings(sellerId: string): Promise<MarketplaceItem[]> {
  await seedMarketplaceDev();
  const items = (await dsList(ITEMS_COLLECTION)) as unknown as MarketplaceItem[];
  return items
    .filter((i) => i.sellerId === sellerId && i.isActive)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createListing(
  sellerId: string,
  data: {
    title: string;
    description: string;
    category: MarketplaceCategory;
    priceCoins: number;
    previewDataUrl: string;
    assetDataUrl: string;
    tags?: string[];
  }
): Promise<MarketplaceItem> {
  if (!data.previewDataUrl?.trim() || !data.assetDataUrl?.trim()) {
    throw new ServiceError(400, 'INVALID_UPLOAD', 'Vorschau und Download-Asset sind erforderlich');
  }

  const id = randomUUID();
  const previewUrl = await persistListingAsset(sellerId, id, data.previewDataUrl, 'preview');
  const downloadUrl = await persistListingAsset(sellerId, id, data.assetDataUrl, 'asset');

  const now = new Date().toISOString();
  const item: MarketplaceItem = {
    id,
    sellerId,
    title: data.title.trim(),
    description: data.description.trim(),
    category: data.category,
    priceCoins: Math.max(5, Math.min(data.priceCoins, 500)),
    previewUrl,
    downloadUrl,
    tags: data.tags ?? [],
    rating: 0,
    reviewCount: 0,
    downloadCount: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  await dsSet(ITEMS_COLLECTION, item.id, item as unknown as Record<string, unknown>);
  return item;
}

export async function deactivateListing(sellerId: string, itemId: string): Promise<MarketplaceItem> {
  const item = await getMarketplaceItem(itemId);
  if (!item || item.sellerId !== sellerId) {
    throw new ServiceError(404, 'NOT_FOUND', 'Listing nicht gefunden');
  }

  item.isActive = false;
  item.updatedAt = new Date().toISOString();
  await dsSet(ITEMS_COLLECTION, item.id, item as unknown as Record<string, unknown>);
  return item;
}
