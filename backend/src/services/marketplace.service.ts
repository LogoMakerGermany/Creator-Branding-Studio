import { randomUUID } from 'node:crypto';
import type { MarketplaceCategory } from '@ucbs/shared';
import { dsGet, dsSet, dsList, dsListWhere } from '../lib/data-store.js';
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

function placeholderSvg(label: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
    <rect width="400" height="300" fill="${color}"/>
    <text x="200" y="150" text-anchor="middle" fill="white" font-size="20" font-family="Arial">${label}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

async function seedMarketplace(): Promise<void> {
  const existing = await dsList(ITEMS_COLLECTION);
  if (existing.length > 0) return;

  const now = new Date().toISOString();
  const seeds: Omit<MarketplaceItem, 'id'>[] = [
    { sellerId: 'system', title: 'Neon Gaming Logo Pack', description: '5 Logos im Cyber-Stil', category: 'logo', priceCoins: 25, previewUrl: placeholderSvg('Logo Pack', '#7C3AED'), downloadUrl: placeholderSvg('Logo Pack', '#7C3AED'), tags: ['gaming', 'neon'], rating: 4.8, reviewCount: 42, downloadCount: 128, isActive: true, createdAt: now, updatedAt: now },
    { sellerId: 'system', title: 'Twitch Overlay Pro', description: 'Komplettes Stream Overlay Set', category: 'overlay', priceCoins: 40, previewUrl: placeholderSvg('Overlay', '#3B82F6'), downloadUrl: placeholderSvg('Overlay', '#3B82F6'), tags: ['twitch', 'stream'], rating: 4.9, reviewCount: 67, downloadCount: 203, isActive: true, createdAt: now, updatedAt: now },
    { sellerId: 'system', title: 'Epic Intro Template', description: 'Animiertes Intro 10s', category: 'intro', priceCoins: 35, previewUrl: placeholderSvg('Intro', '#EC4899'), downloadUrl: placeholderSvg('Intro', '#EC4899'), tags: ['intro', 'animation'], rating: 4.6, reviewCount: 31, downloadCount: 89, isActive: true, createdAt: now, updatedAt: now },
    { sellerId: 'system', title: 'YouTube Banner Bundle', description: '3 Banner-Größen', category: 'banner', priceCoins: 20, previewUrl: placeholderSvg('Banner', '#10B981'), downloadUrl: placeholderSvg('Banner', '#10B981'), tags: ['youtube', 'banner'], rating: 4.7, reviewCount: 55, downloadCount: 156, isActive: true, createdAt: now, updatedAt: now },
    { sellerId: 'system', title: 'VTuber Emote Set', description: '12 Emotes PNG + GIF', category: 'emote', priceCoins: 30, previewUrl: placeholderSvg('Emotes', '#F59E0B'), downloadUrl: placeholderSvg('Emotes', '#F59E0B'), tags: ['vtuber', 'emote'], rating: 4.9, reviewCount: 88, downloadCount: 312, isActive: true, createdAt: now, updatedAt: now },
    { sellerId: 'system', title: 'Stream Sound Pack', description: 'Alerts, Transitions, Jingles', category: 'sound', priceCoins: 15, previewUrl: placeholderSvg('Sounds', '#6366F1'), downloadUrl: placeholderSvg('Sounds', '#6366F1'), tags: ['audio', 'alerts'], rating: 4.5, reviewCount: 24, downloadCount: 76, isActive: true, createdAt: now, updatedAt: now },
    { sellerId: 'system', title: 'OBS Panel Template', description: 'Info, Schedule, Social Panels', category: 'panel', priceCoins: 18, previewUrl: placeholderSvg('Panels', '#14B8A6'), downloadUrl: placeholderSvg('Panels', '#14B8A6'), tags: ['obs', 'panels'], rating: 4.4, reviewCount: 19, downloadCount: 54, isActive: true, createdAt: now, updatedAt: now },
    { sellerId: 'system', title: 'VTuber Character Base', description: 'Live2D-ready Character Design', category: 'vtuber', priceCoins: 50, previewUrl: placeholderSvg('VTuber', '#A855F7'), downloadUrl: placeholderSvg('VTuber', '#A855F7'), tags: ['vtuber', 'character'], rating: 4.9, reviewCount: 41, downloadCount: 97, isActive: true, createdAt: now, updatedAt: now },
  ];

  for (const item of seeds) {
    const id = randomUUID();
    await dsSet(ITEMS_COLLECTION, id, { ...item, id } as unknown as Record<string, unknown>);
  }
}

export async function listMarketplaceItems(category?: MarketplaceCategory): Promise<MarketplaceItem[]> {
  await seedMarketplace();
  const items = await dsList(ITEMS_COLLECTION);
  return items
    .filter((i) => i.isActive === true && (!category || i.category === category))
    .sort((a, b) => Number(b.downloadCount) - Number(a.downloadCount)) as unknown as MarketplaceItem[];
}

export async function getMarketplaceItem(id: string): Promise<MarketplaceItem | null> {
  await seedMarketplace();
  const item = await dsGet(ITEMS_COLLECTION, id);
  return item ? (item as unknown as MarketplaceItem) : null;
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
  if (!item || !item.isActive) throw new Error('Artikel nicht gefunden');

  const already = await dsListWhere(PURCHASES_COLLECTION, { buyerId, itemId });
  if (already.length > 0) throw new Error('Bereits gekauft');

  const coinResult = await deductAmount(buyerId, item.priceCoins, `Marketplace: ${item.title}`);
  if (!coinResult.success) throw new Error('Nicht genügend Coins');

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
  await seedMarketplace();
  const items = await dsList(ITEMS_COLLECTION);
  return items
    .filter((i) => i.sellerId === sellerId && i.isActive === true)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) as unknown as MarketplaceItem[];
}

export async function createListing(
  sellerId: string,
  data: {
    title: string;
    description: string;
    category: MarketplaceCategory;
    priceCoins: number;
    previewUrl?: string;
    downloadUrl?: string;
    tags?: string[];
  }
): Promise<MarketplaceItem> {
  await seedMarketplace();

  const now = new Date().toISOString();
  const label = data.title.slice(0, 24);
  const colors = ['#7C3AED', '#3B82F6', '#EC4899', '#10B981', '#F59E0B'];
  const color = colors[Math.floor(Math.random() * colors.length)];

  const item: MarketplaceItem = {
    id: randomUUID(),
    sellerId,
    title: data.title.trim(),
    description: data.description.trim(),
    category: data.category,
    priceCoins: Math.max(5, Math.min(data.priceCoins, 500)),
    previewUrl: data.previewUrl || placeholderSvg(label, color),
    downloadUrl: data.downloadUrl || data.previewUrl || placeholderSvg(label, color),
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
