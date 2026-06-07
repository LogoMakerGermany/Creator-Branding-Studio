import {
  calculateStreamSetCost,
  STREAM_SET_PLATFORMS,
  STREAM_SET_PLATFORM_LABELS,
  type StreamSetPlatform,
} from './streamSets.js';

export type StreamingPlatform = StreamSetPlatform;
export const STREAM_PLATFORMS: StreamSetPlatform[] = STREAM_SET_PLATFORMS;
export const STREAM_PLATFORM_LABELS: Record<StreamSetPlatform, string> = STREAM_SET_PLATFORM_LABELS;

export type CoinTransactionType = 'debit' | 'credit' | 'refund' | 'purchase';

export interface CoinTransaction {
  id: string;
  userId: string;
  type: CoinTransactionType;
  amount: number;
  balanceAfter: number;
  reason: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface CoinPackage {
  id: string;
  name: string;
  coins: number;
  priceEur: number;
  popular?: boolean;
}

export const COIN_PACKAGES: CoinPackage[] = [
  { id: 'starter', name: 'Starter', coins: 100, priceEur: 9.99 },
  { id: 'creator', name: 'Creator', coins: 500, priceEur: 39.99, popular: true },
  { id: 'pro', name: 'Pro Studio', coins: 1000, priceEur: 69.99 },
];

export type PaymentProvider = 'stripe' | 'paypal';

export interface PaymentRecord {
  id: string;
  userId: string;
  provider: PaymentProvider;
  packageId: string;
  coins: number;
  amountEur: number;
  status: 'pending' | 'completed' | 'failed' | 'mock';
  externalId?: string;
  createdAt: string;
}

export const COIN_COSTS: Record<string, number> = {
  logo: 5,
  banner: 10,
  facecam: 5,
  overlay: 10,
  panel: 4,
  thumbnail: 6,
  sticker: 2,
  stickers_pack: 10,
  stream_set: 40,
  stream_pack: 40,
  intro: 15,
  outro: 10,
  stinger: 12,
  transition: 12,
  loading: 10,
  offline: 8,
  starting_soon: 8,
  brb: 8,
  ending: 8,
  default: 5,
};

export function getCoinCost(assetType: string, count = 1): number {
  const unit = COIN_COSTS[assetType] ?? COIN_COSTS.default;
  return unit * count;
}

export function getStreamSetCoinCost(platform: string): number {
  return calculateStreamSetCost(platform);
}

export const DEFAULT_USER_COINS = 50;
export const ADMIN_COINS = 9999;
export const TESTER_COINS = 200;
